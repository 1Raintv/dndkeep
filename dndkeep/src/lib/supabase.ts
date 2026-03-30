import { createClient } from '@supabase/supabase-js';
import type { Character, Profile, Campaign, CampaignMember, RollResult, SessionState } from '../types';

// =============================================================
// Database type map — mirrors the Supabase schema exactly
// =============================================================
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      characters: {
        Row: Character;
        Insert: Omit<Character, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Character, 'id' | 'user_id' | 'created_at'>>;
      };
      campaigns: {
        Row: Campaign;
        Insert: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Campaign, 'id' | 'owner_id' | 'created_at'>>;
      };
      campaign_members: {
        Row: CampaignMember;
        Insert: Omit<CampaignMember, 'id' | 'joined_at'>;
        Update: Partial<Pick<CampaignMember, 'role'>>;
      };
      roll_logs: {
        Row: RollResult & {
          id: string;
          user_id: string;
          character_id: string | null;
          campaign_id: string | null;
          rolled_at: string;
        };
        Insert: {
          user_id: string;
          character_id?: string | null;
          campaign_id?: string | null;
          label: string;
          dice_expression: string;
          individual_results: number[];
          total: number;
        };
        Update: never;
      };
      session_states: {
        Row: SessionState;
        Insert: Omit<SessionState, 'id' | 'updated_at'>;
        Update: Partial<Omit<SessionState, 'id' | 'campaign_id'>>;
      };
    };
  };
}

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
    .select('*')
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
    .single();
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
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as Campaign[], error: error ? new Error(error.message) : null };
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
    .select('*')
    .eq('user_id', userId)
    .order('rolled_at', { ascending: false })
    .limit(limit);
}

// =============================================================
// Real-time subscriptions (Pro — combat sync)
// =============================================================

export async function getSessionState(
  campaignId: string
): Promise<{ data: SessionState | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('session_states')
    .select('*')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return { data: data as SessionState | null, error: error ? new Error(error.message) : null };
}

export async function upsertSessionState(
  state: Omit<SessionState, 'id' | 'updated_at'>
): Promise<{ data: SessionState | null; error: null | Error }> {
  const { data, error } = await supabase
    .from('session_states')
    .upsert(state, { onConflict: 'campaign_id' })
    .select()
    .single();
  return { data: data as SessionState | null, error: error ? new Error(error.message) : null };
}

export function subscribeToSessionState(
  campaignId: string,
  onUpdate: (state: SessionState) => void
) {
  return supabase
    .channel(`session:${campaignId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'session_states',
        filter: `campaign_id=eq.${campaignId}`,
      },
      (payload) => {
        if (payload.new) onUpdate(payload.new as SessionState);
      }
    )
    .subscribe();
}

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
