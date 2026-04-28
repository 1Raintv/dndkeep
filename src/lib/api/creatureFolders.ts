// v2.351.0 — Folder API for the unified Creatures Manager.
//
// Folders organize the user's creature library across campaigns. A
// folder is owner-scoped (created and managed by one user), with an
// optional campaign_id that scopes visibility:
//   • campaign_id = null → folder lives in the user's personal
//     library, visible across all their campaigns
//   • campaign_id = <campaign> → folder is specific to that campaign,
//     visible to campaign members (per RLS policy created in v2.350)
//
// Folders can nest via parent_folder_id. UI flattens to two levels max
// for sanity (root → child); deeper nesting works at the DB level but
// the v2.351 UI doesn't render past two levels.

import { supabase } from '../supabase';

export interface CreatureFolderRow {
  id: string;
  owner_id: string;
  campaign_id: string | null;
  parent_folder_id: string | null;
  name: string;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

/** List all folders visible to the calling user — owned + campaign-
 *  member-readable. Sorted by parent_folder_id (root-first), then by
 *  sort_index, then name. UI builds a tree from this flat list. */
export async function listFolders(campaignId?: string): Promise<CreatureFolderRow[]> {
  let q = supabase.from('creature_folders').select('*');
  if (campaignId) {
    // OR: folder is scoped to this campaign OR it's a personal folder
    // (campaign_id null) owned by the calling user. RLS already
    // gates by owner / member; we just narrow the visible subset.
    q = q.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  }
  const { data, error } = await q
    .order('parent_folder_id', { ascending: true, nullsFirst: true })
    .order('sort_index', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CreatureFolderRow[];
}

/** Create a new folder. owner_id is set to the calling user (RLS
 *  WITH CHECK enforces this anyway). parent_folder_id null = root. */
export async function createFolder(input: {
  name: string;
  campaignId?: string | null;
  parentFolderId?: string | null;
}): Promise<CreatureFolderRow> {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('creature_folders')
    .insert({
      owner_id: userResp.user.id,
      campaign_id: input.campaignId ?? null,
      parent_folder_id: input.parentFolderId ?? null,
      name: input.name.trim(),
      sort_index: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CreatureFolderRow;
}

/** Rename a folder. Only the owner can rename (RLS). */
export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('creature_folders')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a folder. Creatures in the folder have folder_id set to
 *  NULL by the FK ON DELETE SET NULL — they survive but become
 *  unfiled. Child folders cascade-delete (FK ON DELETE CASCADE).
 *  Caller should confirm with the user before invoking. */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('creature_folders')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Move a creature into (or out of) a folder. Pass null to unfile. */
export async function moveCreatureToFolder(creatureId: string, folderId: string | null): Promise<void> {
  const { error } = await supabase
    .from('homebrew_monsters')
    .update({ folder_id: folderId })
    .eq('id', creatureId);
  if (error) throw error;
}
