// v2.75.0 — Character history audit log helpers.
//
// Writes append-only rows to public.character_history. The table has no
// DELETE/UPDATE RLS policies, so rows are permanent for the life of the
// character. Rows cascade-delete if the character itself is deleted.
//
// The helper never throws. A failed log write must not break the UI.

import { supabase } from './supabase';
import type { Character } from '../types';
import { emitCombatEvent, type CombatEventType } from './combatEvents';

// v2.93.0 — Phase A: character_history legacy writes also emit to combat_events.
// We need campaign_id + character name for the unified event. Cache per-session
// to avoid N extra fetches.
const characterMetaCache = new Map<string, { name: string; campaignId: string | null }>();

async function getCharacterMeta(characterId: string): Promise<{ name: string; campaignId: string | null }> {
  const cached = characterMetaCache.get(characterId);
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('characters')
      .select('name, campaign_id')
      .eq('id', characterId)
      .single();
    const meta = {
      name: data?.name ?? 'Unknown',
      campaignId: (data?.campaign_id as string | null) ?? null,
    };
    characterMetaCache.set(characterId, meta);
    return meta;
  } catch {
    return { name: 'Unknown', campaignId: null };
  }
}

function mapHistoryTypeToCombat(t: HistoryEventType): CombatEventType {
  switch (t) {
    case 'hp_change':           return 'hp_changed';
    case 'temp_hp_change':      return 'temp_hp_changed';
    case 'spell_slot_used':     return 'spell_slot_used';
    case 'spell_slot_restored': return 'spell_slot_restored';
    case 'condition_added':     return 'condition_applied';
    case 'condition_removed':   return 'condition_removed';
    case 'exhaustion_change':   return 'exhaustion_changed';
    case 'concentration_start': return 'concentration_started';
    case 'concentration_end':   return 'concentration_broken';
    case 'rest':                return 'rest_taken';
    case 'level_up':            return 'leveled_up';
    case 'inspiration_change':  return 'inspiration_changed';
    case 'spell_cast':          return 'spell_cast';
    case 'roll':                return 'generic_roll';
    case 'field_change':
    case 'other':
    default:
      return 'character_field_changed';
  }
}

export type HistoryEventType =
  | 'field_change'        // generic field edit (hp, ac, name, xp, etc.)
  | 'spell_slot_used'     // spell_slots[N].used increased
  | 'spell_slot_restored' // spell_slots[N].used decreased
  | 'condition_added'     // active_conditions gained an entry
  | 'condition_removed'   // active_conditions lost an entry
  | 'exhaustion_change'   // exhaustion_level moved
  | 'hp_change'           // current_hp changed
  | 'temp_hp_change'      // temp_hp changed
  | 'concentration_start' // started concentrating on a spell
  | 'concentration_end'   // dropped concentration
  | 'rest'                // short/long rest
  | 'level_up'            // level advanced
  | 'inspiration_change'  // gained or spent inspiration
  | 'spell_cast'          // spell casting event (logged outside applyUpdate)
  | 'roll'                // dice roll event
  | 'other';

export interface HistoryEvent {
  characterId: string;
  userId: string;
  eventType: HistoryEventType;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
}

export async function logHistoryEvent(evt: HistoryEvent): Promise<void> {
  try {
    await supabase.from('character_history').insert({
      character_id: evt.characterId,
      user_id: evt.userId,
      event_type: evt.eventType,
      field: evt.field ?? null,
      old_value: evt.oldValue ?? null,
      new_value: evt.newValue ?? null,
      description: evt.description,
    });
  } catch (e) {
    // Never throw — logging must not break the UI flow.
    // eslint-disable-next-line no-console
    console.warn('[history] logHistoryEvent failed:', e);
  }
  // v2.93.0 — Phase A: dual-write to combat_events (fire-and-forget)
  try {
    const meta = await getCharacterMeta(evt.characterId);
    emitCombatEvent({
      campaignId: meta.campaignId,
      actorType: 'player',
      actorId: evt.characterId,
      actorName: meta.name,
      eventType: mapHistoryTypeToCombat(evt.eventType),
      payload: {
        description: evt.description,
        field: evt.field ?? null,
        old_value: evt.oldValue ?? null,
        new_value: evt.newValue ?? null,
        legacy_event_type: evt.eventType,
      },
    }).catch(() => { /* noop */ });
  } catch { /* noop */ }
}

/**
 * Diff a Character partial update against the current character and return
 * an array of history events describing the meaningful changes.
 *
 * Fields where diffing to a human-readable description is obvious are handled
 * directly; others fall back to a generic "<field> updated" event.
 *
 * Noisy / internal fields are excluded to avoid spamming the log with events
 * the user doesn't care about.
 */
export function describeCharacterChanges(
  prev: Character,
  partial: Partial<Character>,
  characterId: string,
  userId: string
): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const EXCLUDED = new Set<string>([
    'id', 'user_id', 'campaign_id', 'created_at', 'updated_at',
    'share_token', 'share_enabled', 'avatar_url',
    'concentration_rounds_remaining', // echo of concentration_spell changes
  ]);

  for (const rawKey of Object.keys(partial)) {
    const key = rawKey as keyof Character;
    if (EXCLUDED.has(rawKey)) continue;
    const oldVal = (prev as any)[rawKey];
    const newVal = (partial as any)[rawKey];
    if (jsonEqual(oldVal, newVal)) continue;

    // Per-field custom descriptions
    switch (rawKey) {
      case 'current_hp': {
        const delta = (newVal ?? 0) - (oldVal ?? 0);
        const sign = delta > 0 ? '+' : '';
        events.push(evt('hp_change', rawKey, oldVal, newVal,
          `HP ${oldVal} → ${newVal} (${sign}${delta})`));
        continue;
      }
      case 'temp_hp': {
        events.push(evt('temp_hp_change', rawKey, oldVal, newVal,
          `Temp HP ${oldVal ?? 0} → ${newVal ?? 0}`));
        continue;
      }
      case 'max_hp': {
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `Max HP ${oldVal} → ${newVal}`));
        continue;
      }
      case 'armor_class': {
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `Armor Class ${oldVal} → ${newVal}`));
        continue;
      }
      case 'speed': {
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `Speed ${oldVal}ft → ${newVal}ft`));
        continue;
      }
      case 'initiative_bonus': {
        const oldSign = (oldVal ?? 0) >= 0 ? '+' : '';
        const newSign = (newVal ?? 0) >= 0 ? '+' : '';
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `Initiative bonus ${oldSign}${oldVal ?? 0} → ${newSign}${newVal ?? 0}`));
        continue;
      }
      case 'level': {
        events.push(evt('level_up', rawKey, oldVal, newVal,
          `Level ${oldVal} → ${newVal}`));
        continue;
      }
      case 'experience_points': {
        const delta = (newVal ?? 0) - (oldVal ?? 0);
        const sign = delta > 0 ? '+' : '';
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `XP ${oldVal ?? 0} → ${newVal ?? 0} (${sign}${delta})`));
        continue;
      }
      case 'exhaustion_level': {
        events.push(evt('exhaustion_change', rawKey, oldVal, newVal,
          `Exhaustion ${oldVal ?? 0} → ${newVal ?? 0}`));
        continue;
      }
      case 'inspiration': {
        events.push(evt('inspiration_change', rawKey, oldVal, newVal,
          newVal ? 'Gained Inspiration' : 'Spent Inspiration'));
        continue;
      }
      case 'concentration_spell': {
        const had = !!oldVal;
        const has = !!newVal;
        if (!had && has) {
          events.push(evt('concentration_start', rawKey, oldVal, newVal,
            `Started concentrating on ${newVal}`));
        } else if (had && !has) {
          events.push(evt('concentration_end', rawKey, oldVal, newVal,
            `Dropped concentration on ${oldVal}`));
        } else if (had && has && oldVal !== newVal) {
          events.push(evt('concentration_start', rawKey, oldVal, newVal,
            `Switched concentration: ${oldVal} → ${newVal}`));
        }
        continue;
      }
      case 'active_conditions': {
        const oldSet = new Set<string>(Array.isArray(oldVal) ? oldVal : []);
        const newSet = new Set<string>(Array.isArray(newVal) ? newVal : []);
        for (const c of newSet) if (!oldSet.has(c)) {
          events.push(evt('condition_added', rawKey, oldVal, newVal,
            `Condition added: ${c}`));
        }
        for (const c of oldSet) if (!newSet.has(c)) {
          events.push(evt('condition_removed', rawKey, oldVal, newVal,
            `Condition removed: ${c}`));
        }
        continue;
      }
      case 'spell_slots': {
        const oldSlots = (oldVal ?? {}) as Record<string, { total: number; used: number }>;
        const newSlots = (newVal ?? {}) as Record<string, { total: number; used: number }>;
        const levels = new Set([...Object.keys(oldSlots), ...Object.keys(newSlots)]);
        for (const lvl of levels) {
          const o = oldSlots[lvl]; const n = newSlots[lvl];
          if (!o && !n) continue;
          const oUsed = o?.used ?? 0; const nUsed = n?.used ?? 0;
          const oTotal = o?.total ?? 0; const nTotal = n?.total ?? 0;
          if (oUsed === nUsed && oTotal === nTotal) continue;
          const lvlLabel = lvlOrdinal(lvl);
          if (oTotal !== nTotal) {
            events.push(evt('field_change', rawKey, o, n,
              `${lvlLabel} slot pool: ${oTotal} → ${nTotal}`));
          } else if (nUsed > oUsed) {
            events.push(evt('spell_slot_used', rawKey, o, n,
              `${lvlLabel} slot used (${nTotal - nUsed}/${nTotal} remaining)`));
          } else {
            events.push(evt('spell_slot_restored', rawKey, o, n,
              `${lvlLabel} slot restored (${nTotal - nUsed}/${nTotal} remaining)`));
          }
        }
        continue;
      }
      case 'death_saves_successes':
      case 'death_saves_failures': {
        const label = rawKey === 'death_saves_successes' ? 'Death save successes' : 'Death save failures';
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `${label}: ${oldVal ?? 0} → ${newVal ?? 0}`));
        continue;
      }
      case 'prepared_spells': {
        const oldSet = new Set<string>(Array.isArray(oldVal) ? oldVal : []);
        const newSet = new Set<string>(Array.isArray(newVal) ? newVal : []);
        const added = [...newSet].filter(x => !oldSet.has(x));
        const removed = [...oldSet].filter(x => !newSet.has(x));
        if (added.length) events.push(evt('field_change', rawKey, oldVal, newVal,
          `Prepared: ${added.join(', ')}`));
        if (removed.length) events.push(evt('field_change', rawKey, oldVal, newVal,
          `Unprepared: ${removed.join(', ')}`));
        continue;
      }
      case 'known_spells': {
        const oldSet = new Set<string>(Array.isArray(oldVal) ? oldVal : []);
        const newSet = new Set<string>(Array.isArray(newVal) ? newVal : []);
        const added = [...newSet].filter(x => !oldSet.has(x));
        const removed = [...oldSet].filter(x => !newSet.has(x));
        if (added.length) events.push(evt('field_change', rawKey, oldVal, newVal,
          `Learned spell: ${added.join(', ')}`));
        if (removed.length) events.push(evt('field_change', rawKey, oldVal, newVal,
          `Unlearned spell: ${removed.join(', ')}`));
        continue;
      }
      case 'name': {
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `Renamed: "${oldVal}" → "${newVal}"`));
        continue;
      }
      case 'class_name':
      case 'subclass':
      case 'species':
      case 'background': {
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `${capitalize(rawKey.replace(/_/g, ' '))}: "${oldVal ?? '—'}" → "${newVal ?? '—'}"`));
        continue;
      }
      case 'strength': case 'dexterity': case 'constitution':
      case 'intelligence': case 'wisdom': case 'charisma': {
        events.push(evt('field_change', rawKey, oldVal, newVal,
          `${capitalize(rawKey)}: ${oldVal} → ${newVal}`));
        continue;
      }
      default: {
        // Generic fallback. Keep it short — values may be large objects.
        const preview = previewValue(newVal);
        events.push(evt('field_change', rawKey, oldVal, newVal,
          preview ? `${humanField(rawKey)}: ${preview}` : `${humanField(rawKey)} updated`));
      }
    }
  }

  function evt(
    eventType: HistoryEventType,
    field: string | undefined,
    oldValue: unknown,
    newValue: unknown,
    description: string
  ): HistoryEvent {
    return { characterId, userId, eventType, field, oldValue, newValue, description };
  }

  return events;
}

// ── helpers ────────────────────────────────────────────────────────────
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function humanField(key: string): string {
  return capitalize(key.replace(/_/g, ' '));
}
function lvlOrdinal(lvl: string): string {
  const n = parseInt(lvl, 10);
  if (isNaN(n) || n <= 0) return `Level ${lvl}`;
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}-level`;
}
function previewValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `(${v.length} item${v.length === 1 ? '' : 's'})`;
  return '(updated)';
}

/**
 * Batch-helper: fire-and-forget insert of many events in one round-trip.
 * Safe to call even with an empty array.
 */
export async function logHistoryEvents(events: HistoryEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    const rows = events.map(e => ({
      character_id: e.characterId,
      user_id: e.userId,
      event_type: e.eventType,
      field: e.field ?? null,
      old_value: e.oldValue ?? null,
      new_value: e.newValue ?? null,
      description: e.description,
    }));
    await supabase.from('character_history').insert(rows);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[history] logHistoryEvents failed:', e);
  }

  // v2.93.0 — Phase A: dual-write to combat_events. Batch per-character to
  // reuse meta cache and avoid refetching per event.
  try {
    const byCharacter = new Map<string, HistoryEvent[]>();
    for (const e of events) {
      const arr = byCharacter.get(e.characterId) ?? [];
      arr.push(e);
      byCharacter.set(e.characterId, arr);
    }
    for (const [charId, evts] of byCharacter.entries()) {
      const meta = await getCharacterMeta(charId);
      for (const e of evts) {
        emitCombatEvent({
          campaignId: meta.campaignId,
          actorType: 'player',
          actorId: charId,
          actorName: meta.name,
          eventType: mapHistoryTypeToCombat(e.eventType),
          payload: {
            description: e.description,
            field: e.field ?? null,
            old_value: e.oldValue ?? null,
            new_value: e.newValue ?? null,
            legacy_event_type: e.eventType,
          },
        }).catch(() => { /* noop */ });
      }
    }
  } catch { /* noop */ }
}
