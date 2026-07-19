import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '../types';
import { supabase, getProfile } from '../lib/supabase';
import { isSubscriptionActive } from '../lib/entitlements';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** v2.563.0 — true when auth initialization failed to reach Supabase
   *  (network down or project paused). Gates render a "Can't reach
   *  server — Retry" state instead of an infinite spinner. */
  initError: boolean;
  /** v2.563.0 — re-run auth initialization after an initError. */
  retryInit: () => void;
  isPro: boolean;
  /** v2.518.0 — Authoritative "is the subscription active right now?"
   *  flag, derived from subscription_status ('active'/'trialing') via
   *  the entitlements engine. This is the signal gates should use for
   *  subscriber-only features (level 10+, campaign creation), because
   *  it reflects Stripe's actual billing state rather than a static
   *  tier label. `isPro` is retained for back-compat with older call
   *  sites that key off subscription_tier. */
  isSubscribed: boolean;
  /** v2.329.0 — T7: derived flag mirroring profile.show_ua_content
   *  with a safe `false` default. Consumers in the character creator
   *  / subclass pickers / class compendium use this to filter out
   *  UA-source classes (Psion + its subclasses) from public view. */
  showUaContent: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  initError: false,
  retryInit: () => {},
  isPro: false,
  isSubscribed: false,
  showUaContent: false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  // v2.563.0 — bump to re-run the init effect (Retry button).
  const [initNonce, setInitNonce] = useState(0);

  async function fetchProfile(userId: string) {
    const { data } = await getProfile(userId);
    if (data) setProfile(data);
  }

  async function refreshProfile() {
    if (session?.user) await fetchProfile(session.user.id);
  }

  function retryInit() {
    setInitError(false);
    setLoading(true);
    setInitNonce(n => n + 1);
  }

  useEffect(() => {
    // v2.563.0 — Frontend resilience. `supabase.auth.getSession()` can
    // hang indefinitely when Supabase is unreachable (network down, or
    // the free-tier project auto-paused — this has caused real outages
    // where the app sat on "Loading…" forever). Bound the init with a
    // 12s timeout and surface a Retry state instead of a dead spinner.
    let cancelled = false;
    const TIMEOUT_MS = 12000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('auth-init-timeout')), TIMEOUT_MS));

    Promise.race([supabase.auth.getSession(), timeout])
      .then(({ data: { session: s } }) => {
        if (cancelled) return;
        setSession(s);
        if (s?.user) {
          // Profile fetch failing shouldn't dead-end the app — proceed
          // with a null profile (degraded but usable) either way.
          fetchProfile(s.user.id).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setInitError(true);
        // loading stays true: gates branch on initError before spinner.
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id).catch(() => {});
      else setProfile(null);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [initNonce]);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      initError,
      retryInit,
      isPro: profile?.subscription_tier === 'pro',
      isSubscribed: isSubscriptionActive(profile),
      showUaContent: profile?.show_ua_content === true,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
