// v2.494.0 — Buff duration lifecycle (decrement, format, sweep).
//
// Background:
//   Active buffs (Bless, Stoneskin, Hunter's Mark, etc.) carry an
//   `duration` field measured in rounds. Pre-v2.494 the lifecycle
//   was ad-hoc: combat advanceTurn didn't tick durations, and the
//   PartyDashboard Advance Time button hard-coded round counts.
//
//   This module centralises four pieces:
//     1. decrementBuffDurations — pure decrement of an ActiveBuff[]
//        array. Used by combat tick and out-of-combat sweep alike.
//     2. hoursToRounds — used by Advance Time math. Converts wall-
//        clock hours to rounds via campaigns.seconds_per_round.
//     3. formatDurationLabel — DM-facing "Xr / Y sec" string.
//     4. elapseCampaignBuffDurations — sweeps characters /
//        combatants / homebrew_monsters and decrements all their
//        active_buffs by N rounds. Fire-and-forget at the error
//        boundary; collects errors and returns them rather than
//        throwing, so a single table failure can't strand the
//        Advance Time button mid-call.
//
//   See also: src/lib/combatEncounter.ts (per-turn tick),
//             src/components/Campaign/PartyDashboard.tsx (sweep
//             caller), src/components/Campaign/CampaignSettings.tsx
//             (seconds_per_round configuration UI).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { asJsonb } from './jsonbCast';
import type { ActiveBuff } from '../types';

// ----------------------------------------------------------------
// 1. decrementBuffDurations
// ----------------------------------------------------------------
//
// Pure function. Walks a buff array and:
//   - SKIPS entries with no numeric `duration` field (mechanical
//     riders like Hunter's Mark damage bonus that ride on a
//     separate concentration source).
//   - SKIPS entries with duration < 0 (indefinite / Mage Armor).
//   - DECREMENTS duration by `rounds` (default 1) when finite > 0.
//   - DROPS entries whose decremented duration is ≤ 0.
//
// Returns { changed, next }. `changed` is true iff the buff list
// is materially different (drop or decrement). Callers can use
// this to skip a DB write when nothing happened.
export function decrementBuffDurations(
  current: ActiveBuff[] | null | undefined,
  rounds: number = 1,
): { changed: boolean; next: ActiveBuff[] } {
  if (!Array.isArray(current) || current.length === 0) {
    return { changed: false, next: [] };
  }
  const ticks = Math.max(0, Math.floor(rounds));
  if (ticks === 0) {
    return { changed: false, next: current.slice() };
  }

  let changed = false;
  const next: ActiveBuff[] = [];
  for (const buff of current) {
    const dur = (buff as ActiveBuff | undefined)?.duration;
    // Mechanical rider — no duration field at all. Pass through.
    if (typeof dur !== 'number' || !Number.isFinite(dur)) {
      next.push(buff);
      continue;
    }
    // Indefinite. Pass through.
    if (dur < 0) {
      next.push(buff);
      continue;
    }
    const remaining = dur - ticks;
    if (remaining <= 0) {
      // Expired. Drop.
      changed = true;
      continue;
    }
    if (remaining === dur) {
      next.push(buff);
    } else {
      changed = true;
      next.push({ ...buff, duration: remaining });
    }
  }
  return { changed, next };
}

// ----------------------------------------------------------------
// 2. hoursToRounds
// ----------------------------------------------------------------
//
// Converts wall-clock hours to combat rounds at the given
// seconds-per-round setting. Used by PartyDashboard Advance Time
// buttons whose intent is stored in seconds (3600/28800/86400 for
// 1h/8h/24h) and converted at click time so the DM's Time Scale
// chip drives the math.
//
// Clamps secondsPerRound to the same range the DB CHECK enforces
// (1-600) as a defensive measure against drift between the UI
// validator and the DB.
export function hoursToRounds(hours: number, secondsPerRound: number): number {
  const safeSpr = Math.max(1, Math.min(600, Math.floor(secondsPerRound || 10)));
  const safeHours = Math.max(0, hours);
  return Math.round((safeHours * 3600) / safeSpr);
}

// ----------------------------------------------------------------
// 3. formatDurationLabel
// ----------------------------------------------------------------
//
// Renders the DM-facing duration label for a buff chip:
//   formatDurationLabel(10, 10)  → "10r / 1 min 40 sec"
//   formatDurationLabel(6, 6)    → "6r / 36 sec"
//   formatDurationLabel(1, 10)   → "1r / 10 sec"
//   formatDurationLabel(-1, 10)  → "indefinite"
//   formatDurationLabel(0, 10)   → "expired"
//   formatDurationLabel(NaN, 10) → "expired"  (defensive)
//
// Players never see this label — UI gates on isDM. See
// NpcTokenQuickPanel render block.
export function formatDurationLabel(rounds: number, secondsPerRound: number): string {
  if (typeof rounds !== 'number' || !Number.isFinite(rounds)) {
    return 'expired';
  }
  if (rounds < 0) {
    return 'indefinite';
  }
  if (rounds === 0) {
    return 'expired';
  }
  const safeSpr = Math.max(1, Math.min(600, Math.floor(secondsPerRound || 10)));
  const totalSec = rounds * safeSpr;

  let timeStr: string;
  if (totalSec < 60) {
    timeStr = `${totalSec} sec`;
  } else {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (secs === 0) {
      timeStr = `${mins} min`;
    } else {
      timeStr = `${mins} min ${secs} sec`;
    }
  }
  return `${rounds}r / ${timeStr}`;
}

// ----------------------------------------------------------------
// 4. elapseCampaignBuffDurations
// ----------------------------------------------------------------
//
// Sweeps the three buff-bearing tables for the campaign and
// decrements every row's active_buffs by `rounds`. Sequential
// rather than parallel: the campaign data set is small (party-
// sized) and sequential is easier to reason about under error.
//
// Never throws. Each table's failure is captured in the returned
// errors[] so the Advance Time button can continue UI flow even
// if (say) a transient combatants RLS error happened.
//
// Tables touched:
//   - characters         (Row.active_buffs: Json | null)
//   - combatants         (Row.active_buffs: Json)
//   - homebrew_monsters  (Row.active_buffs: Json)
export async function elapseCampaignBuffDurations(
  supabase: SupabaseClient<Database>,
  campaignId: string,
  rounds: number,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const ticks = Math.max(0, Math.floor(rounds));
  if (ticks === 0 || !campaignId) {
    return { errors };
  }

  type RowWithBuffs = { id: string; active_buffs: unknown };

  // characters
  try {
    const { data, error } = await supabase
      .from('characters')
      .select('id, active_buffs')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    for (const row of (data ?? []) as RowWithBuffs[]) {
      const current = (row.active_buffs as ActiveBuff[] | null) ?? null;
      const { changed, next } = decrementBuffDurations(current, ticks);
      if (changed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upErr } = await supabase
          .from('characters')
          .update({ active_buffs: asJsonb(next) })
          .eq('id', row.id);
        if (upErr) errors.push(`characters[${row.id}]: ${upErr.message}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`characters: ${msg}`);
  }

  // combatants
  try {
    const { data, error } = await supabase
      .from('combatants')
      .select('id, active_buffs')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    for (const row of (data ?? []) as RowWithBuffs[]) {
      const current = (row.active_buffs as ActiveBuff[] | null) ?? null;
      const { changed, next } = decrementBuffDurations(current, ticks);
      if (changed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upErr } = await supabase
          .from('combatants')
          .update({ active_buffs: asJsonb(next) })
          .eq('id', row.id);
        if (upErr) errors.push(`combatants[${row.id}]: ${upErr.message}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`combatants: ${msg}`);
  }

  // homebrew_monsters
  try {
    const { data, error } = await supabase
      .from('homebrew_monsters')
      .select('id, active_buffs')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    for (const row of (data ?? []) as RowWithBuffs[]) {
      const current = (row.active_buffs as ActiveBuff[] | null) ?? null;
      const { changed, next } = decrementBuffDurations(current, ticks);
      if (changed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upErr } = await supabase
          .from('homebrew_monsters')
          .update({ active_buffs: asJsonb(next) })
          .eq('id', row.id);
        if (upErr) errors.push(`homebrew_monsters[${row.id}]: ${upErr.message}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`homebrew_monsters: ${msg}`);
  }

  return { errors };
}
