import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '../types';
import type { GateContext } from '../data/contentGates';
import { supabase, getProfile } from '../lib/supabase';
import { isSubscriptionActive } from '../lib/entitlements';
import { BETA } from '../lib/betaMode';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** v2.637 perf (audit 6.5) — true while the profile row is still in
   *  flight AFTER the session has resolved. `loading` now clears at
   *  session-resolve so authenticated UI renders one round-trip sooner;
   *  the few surfaces that branch on subscription state (Pro gates)
   *  should wait on THIS flag to avoid flashing the upsell at a Pro
   *  user whose profile hasn't landed yet. */
  profileLoading: boolean;
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
  /** v2.689.0 — the viewer's per-account content grants, ready to hand
   *  straight to data/contentGates.ts. Passed as one object so a new gated
   *  source needs no change at any call site. Prefer this over reading the
   *  individual flags; `showUaContent` above stays for existing callers. */
  contentGate: GateContext;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileLoading: true,
  initError: false,
  retryInit: () => {},
  isPro: false,
  isSubscribed: false,
  showUaContent: false,
  contentGate: {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  // v2.563.0 — bump to re-run the init effect (Retry button).
  const [initNonce, setInitNonce] = useState(0);

  const reloadProfile = useRef<() => Promise<void>>(async () => {});
  const refreshProfile = useCallback(() => reloadProfile.current(), []);
  const retryInit = useCallback(() => {
    setInitError(false);
    setLoading(true);
    setInitNonce(n => n + 1);
  }, []);

  useEffect(() => {
    // v2.695.0 — callbacks publish session state only; profile requests run
    // in a separate effect, outside Supabase's auth notification lock.
    let cancelled = false;
    let eventReceived = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !eventReceived) setInitError(true);
    }, 12000);
    const accept = (next: Session | null) => {
      if (cancelled) return;
      setSession(next);
      setLoading(false);
      setInitError(false);
      clearTimeout(timeout);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      eventReceived = true;
      accept(next);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled || eventReceived) return;
      if (error) throw error;
      accept(data.session);
    }).catch(() => {
      if (!cancelled && !eventReceived) setInitError(true);
    });
    return () => { cancelled = true; clearTimeout(timeout); subscription.unsubscribe(); };
  }, [initNonce]);

  const userId = session?.user.id;
  useEffect(() => {
    // Missing rows and hung requests must leave loading. Generations discard
    // old-account and old-retry responses, including their loading updates.
    let generation = 0;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const load = async () => {
      const request = ++generation;
      setProfile(null);
      setProfileLoading(!!userId);
      if (!userId) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('profile-timeout')), 12000);
        timers.add(timer);
      });
      try {
        const { data, error } = await Promise.race([getProfile(userId), timeout]);
        if (!cancelled && request === generation) {
          setProfile(!error && data?.id === userId ? data : null);
        }
      } catch {
        // Settings offers retry/sign-out without requiring a profile row.
      } finally {
        clearTimeout(timer);
        if (timer !== undefined) timers.delete(timer);
        if (!cancelled && request === generation) setProfileLoading(false);
      }
    };
    reloadProfile.current = load;
    void load();
    return () => {
      cancelled = true;
      ++generation;
      timers.forEach(clearTimeout);
      reloadProfile.current = async () => {};
    };
  }, [userId, initNonce]);

  // Never expose the previous account's grants during the effect transition.
  const currentProfile = profile?.id === userId ? profile : null;
  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile: currentProfile,
    loading,
    profileLoading,
    initError,
    retryInit,
    // v2.693.0 — the beta grants Pro-gated features (campaigns page, homebrew,
    // realtime sync) so the one campaign each tester gets is actually usable.
    // Reads the switch rather than the profile, so no billing column is faked.
    isPro: BETA.enabled || currentProfile?.subscription_tier === 'pro',
    isSubscribed: isSubscriptionActive(currentProfile),
    showUaContent: currentProfile?.show_ua_content === true,
    contentGate: {
      showUaContent: currentProfile?.show_ua_content === true,
      showNonSrdContent: currentProfile?.show_non_srd_content === true,
    },
    refreshProfile,
  }), [session, currentProfile, loading, profileLoading, initError, retryInit, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
