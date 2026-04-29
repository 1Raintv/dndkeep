import { createClient } from '@supabase/supabase-js';
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

export async function signUp(email: string, password: string, displayName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
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
    .select('id,email,display_name,subscription_tier,stripe_customer_id,subscription_status,show_ua_content,created_at,updated_at')
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
  const { data: { user } } = await supabase.auth.getUser();
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
