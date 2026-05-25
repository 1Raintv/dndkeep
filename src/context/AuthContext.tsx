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
  isPro: false,
  isSubscribed: false,
  showUaContent: false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data } = await getProfile(userId);
    if (data) setProfile(data);
  }

  async function refreshProfile() {
    if (session?.user) await fetchProfile(session.user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
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
