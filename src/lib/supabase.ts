import { createClient } from '@supabase/supabase-js';
// v2.680.0 — LOAD-BEARING IMPORT ORDER. authLanding captures the auth
// fragment (#access_token=...&type=invite) at module-evaluation time.
// createClient() below runs with `detectSessionInUrl: true`, which
// consumes and clears that fragment. An imported module's body evaluates
// before the body of the module importing it, so this must stay above
// the createClient call — and must not be reduced to a `import type`.
// Without it we cannot tell an invited user from a returning one, and
// invited users never get asked to set a password.
import './authLanding';
// Acyclic despite appearances: checked.ts → log.ts → version.ts only.
// The Supabase log sink imports this module dynamically, not statically.
import { checkedWrite } from './api/checked';
import type { Character, Profile, Campaign } from '../types';
import type { Database } from '../types/supabase';

// =============================================================
// Database type — auto-generated from the live schema.
// =============================================================
// v2.250.0 — replaced the hand-rolled Database interface (with a row
// of `AnyRow` stubs) with the full schema introspection generated to
// `src/types/supabase.ts`. The previous version had only ~6 tables
// typed concretely and the rest stubbed as `any`, which collapsed
// the supabase-js builder chain to `never` everywhere except the
// concretely-typed handful. New rule: all table typings come from
// the generated file; domain shapes (Character, Profile, etc.) still
// live in `src/types/index.ts` and callers cast at the boundary.
export type { Database };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill in your project credentials.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// =============================================================
// Auth helpers
// =============================================================

// v2.680.0 — signUp() is deliberately gone. DNDKeep is an invite-only
// beta: accounts are created by inviting an email address from the
// Supabase dashboard, and public sign-ups are disabled at the project
// level. The client-side helper was removed alongside the UI so a stray
// caller cannot re-open the door the project setting closed.

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Email the user a password-reset link.
 *  v2.680.0 — new. Until now the app had no recovery path at all, so a
 *  forgotten password was a permanent lockout. That was survivable while
 *  anyone could create a fresh account; under invite-only it would mean
 *  losing the account for good. `redirectTo` points at the dedicated
 *  landing route so the link works even if the project's default redirect
 *  is the bare site root. */
export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/set-password`,
  });
}

/** Set the signed-in user's password, and optionally their display name.
 *  v2.680.0 — serves both arms of the same flow: an invited user choosing
 *  their first password, and an existing user resetting a forgotten one.
 *  Both arrive holding a valid session minted from the emailed link, which
 *  is what authorises the change. */
export async function setPassword(password: string, displayName?: string) {
  const attrs: { password: string; data?: { display_name: string } } = { password };
  const trimmed = displayName?.trim();
  if (trimmed) attrs.data = { display_name: trimmed };
  const res = await supabase.auth.updateUser(attrs);

  // The auth metadata only feeds `handle_new_user` at account creation,
  // which has already run by now — the app itself reads
  // `profiles.display_name`. An invited account was seeded with the
  // email's local part (the trigger's coalesce fallback), so without this
  // second write the name they just chose would never appear anywhere.
  // Deliberately not fatal: the password is set either way, and failing
  // the whole flow over a display name would lock them out of an account
  // that is now perfectly usable.
  if (!res.error && trimmed && res.data?.user?.id) {
    await checkedWrite(
      'profiles.update display_name',
      { userId: res.data.user.id },
      supabase.from('profiles').update({ display_name: trimmed }).eq('id', res.data.user.id),
    );
  }
  return res;
}

export async function signOut() {
  // v2.284.0 — also clear the stored last-route so the next sign-in
  // doesn't bounce the new user (or returning user in incognito) to
  // a path they no longer have access to. Wrapped in try/catch
  // because localStorage can throw in restrictive contexts (Safari
  // private mode, embedded webviews, quota exceeded). signOut should
  // proceed regardless; missing the key removal is a minor UX wart,
  // not a correctness break.
  try { localStorage.removeItem('dndkeep:last-route'); } catch { /* ignore */ }
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

// v2.503.0 — Lightweight current-user-id accessor.
//
// Background: supabase.auth.getUser() makes a NETWORK round-trip to
// the gotrue /user endpoint AND acquires the cross-tab Web Lock on the
// auth token. When many call sites invoke getUser() concurrently (the
// campaign-load path alone fires it via getCampaignsByMember plus
// several PartyDashboard / ChecksPanel interactions), they livelock on
// that lock — each call "steals" it from the others, aborting in-flight
// requests with "Lock broken by another request with the 'steal'
// option." The visible symptom was a permanent "Loading campaign…"
// because getCampaignsByMember's getUser() never cleanly resolved.
//
// getSession() reads the persisted session from local storage with no
// network round-trip and far lighter lock pressure. For everything we
// use the user id for (stamping user_id on inserts, scoping queries),
// the locally-cached session id is exactly as correct as a fresh
// getUser() — the token is already validated on use by RLS server-side.
// We only need getUser() when we specifically want to re-validate the
// token against the server, which none of these call sites do.
//
// AuthContext is the canonical session source (getSession +
// onAuthStateChange); this helper is for non-React modules and helpers
// that can't read the context.
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// =============================================================
// Profile helpers
// =============================================================

export async function getProfile(userId: string): Promise<{ data: Profile | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('profiles')
    // v2.365.0 — added show_ua_content. Pre-v2.365 the column was
    // omitted from this explicit list, so the AuthContext's derived
    // showUaContent flag was always false (undefined !== true) even
    // when the DB row had the flag set. That hid Psion + UA content
    // for every user with the flag on.
    .select('id,email,display_name,subscription_tier,stripe_customer_id,subscription_status,show_ua_content,show_non_srd_content,extra_character_slots,extra_campaign_slots,ultimate_campaign,active_dice_skin,last_sign_in_at,created_at,updated_at')
    .eq('id', userId)
    .single();
  return { data: data as Profile | null, error: error ? new Error(error.message) : null };
}

export async function updateProfile(userId: string, updates: Database['public']['Tables']['profiles']['Update']) {
  return supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
}

// =============================================================
// Character helpers
// =============================================================

/**
 * Returns characters as a typed Character[] — callers don't need to cast.
 * Returns empty array on error rather than throwing.
 */
export async function getCharacters(userId: string): Promise<{ data: Character[]; error: null | Error }> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as Character[], error: error ? new Error(error.message) : null };
}

export async function getCharacter(characterId: string): Promise<{ data: Character | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .maybeSingle();
  return { data: data as Character | null, error: error ? new Error(error.message) : null };
}

export async function getCharactersByCampaign(campaignId: string): Promise<{ data: Character[]; error: null | Error }> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId);
  return { data: (data ?? []) as Character[], error: error ? new Error(error.message) : null };
}

export async function createCharacter(
  character: Database['public']['Tables']['characters']['Insert']
): Promise<{ data: Character | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('characters')
    .insert(character)
    .select()
    .single();
  return { data: data as Character | null, error: error ? new Error(error.message) : null };
}

export async function updateCharacter(
  characterId: string,
  updates: Database['public']['Tables']['characters']['Update']
) {
  return supabase
    .from('characters')
    .update(updates)
    .eq('id', characterId)
    .select()
    .single();
}

export async function deleteCharacter(characterId: string): Promise<{ error: null | Error }> {
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId);
  return { error: error ? new Error(error.message) : null };
}

// =============================================================
// Campaign helpers
// =============================================================

/**
 * Returns all campaigns visible to the current authenticated user
 * (RLS handles filtering to rows the user belongs to).
 */
export async function getCampaignsByMember(): Promise<{ data: Campaign[]; error: null | Error }> {
  // v2.503.0 — was supabase.auth.getUser() (network + heavy auth-lock).
  // Switched to the locally-cached session id to break the lock
  // livelock that left the app stuck on "Loading campaign…". See
  // getCurrentUserId() doc comment.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return { data: [], error: null };
  // Fetch campaigns where user is owner OR a member
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_members!inner(user_id)')
    .eq('campaign_members.user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    // Fallback: just get owned campaigns
    const { data: owned } = await supabase.from('campaigns').select('id,owner_id,name,description,setting,is_active,join_code,created_at,updated_at,notes').eq('owner_id', user.id).order('created_at', { ascending: false });
    return { data: (owned ?? []) as Campaign[], error: null };
  }
  return { data: (data ?? []) as Campaign[], error: null };
}

export async function createCampaign(
  campaign: Database['public']['Tables']['campaigns']['Insert']
): Promise<{ data: Campaign | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();
  return { data: data as Campaign | null, error: error ? new Error(error.message) : null };
}

export async function joinCampaignByCode(
  code: string
): Promise<{ data: { id: string; name: string } | null; error: null | Error }> {
  const { data, error } = await supabase.rpc('get_campaign_by_code', { code: code.toUpperCase().trim() });
  if (error) return { data: null, error: new Error(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row ?? null, error: null };
}

export async function refreshCampaignJoinCode(
  campaignId: string
): Promise<{ data: string | null; error: null | Error }> {
  // Generate a new code by calling the function directly
  const { data: newCode, error: codeErr } = await supabase.rpc('generate_join_code');
  if (codeErr) return { data: null, error: new Error(codeErr.message) };

  const { error: updateErr } = await supabase
    .from('campaigns')
    .update({ join_code: newCode })
    .eq('id', campaignId);
  if (updateErr) return { data: null, error: new Error(updateErr.message) };
  return { data: newCode as string, error: null };
}


export async function deleteCampaign(campaignId: string): Promise<{ error: null | Error }> {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId);
  return { error: error ? new Error(error.message) : null };
}

// =============================================================
// Campaign member helpers
// =============================================================

export interface MemberWithProfile {
  id: string;
  campaign_id: string;
  user_id: string;
  role: 'dm' | 'player';
  joined_at: string;
  profiles: { display_name: string | null; email: string } | null;
}

export async function getCampaignMembers(
  campaignId: string
): Promise<{ data: MemberWithProfile[]; error: null | Error }> {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('*, profiles(display_name, email)')
    .eq('campaign_id', campaignId);
  return {
    data: (data ?? []) as MemberWithProfile[],
    error: error ? new Error(error.message) : null,
  };
}

export async function lookupProfileByEmail(
  email: string
): Promise<{ data: { id: string } | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.trim())
    .maybeSingle();
  return {
    data: data as { id: string } | null,
    error: error ? new Error(error.message) : null,
  };
}

export async function addCampaignMember(
  campaignId: string,
  userId: string,
  role: 'dm' | 'player' = 'player'
): Promise<{ error: null | Error }> {
  const { error } = await supabase
    .from('campaign_members')
    .upsert({ campaign_id: campaignId, user_id: userId, role }, { onConflict: 'campaign_id,user_id' });
  return { error: error ? new Error(error.message) : null };
}

export async function removeCampaignMember(
  campaignId: string,
  userId: string
): Promise<{ error: null | Error }> {
  const { error } = await supabase
    .from('campaign_members')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

// =============================================================
// Roll log helpers
// =============================================================

export async function appendRollLog(
  entry: Database['public']['Tables']['roll_logs']['Insert']
) {
  return supabase.from('roll_logs').insert(entry).select().single();
}

export async function getRollLog(userId: string, limit = 50) {
  return supabase
    .from('roll_logs')
    .select('id,label,dice_expression,individual_results,total,rolled_at,character_id,campaign_id')
    .eq('user_id', userId)
    .order('rolled_at', { ascending: false })
    .limit(limit);
}

// =============================================================
// Real-time subscriptions (Pro — combat sync)
// =============================================================
//
// v2.296.0 — Plumbing cleanup. Removed:
//   getSessionState         (deleted)
//   upsertSessionState      (deleted)
//   subscribeToSessionState (deleted)
// All three targeted the now-dropped session_states table. Modern
// combat state lives on combat_encounters + combat_participants and
// is consumed via useCombat() / CombatProvider; the realtime channel
// is owned by CombatProvider, not this module.

export function subscribeToCharacter(
  characterId: string,
  onUpdate: (character: Character) => void
) {
  return supabase
    .channel(`character:${characterId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'characters',
        filter: `id=eq.${characterId}`,
      },
      (payload) => {
        if (payload.new) onUpdate(payload.new as Character);
      }
    )
    .subscribe();
}
