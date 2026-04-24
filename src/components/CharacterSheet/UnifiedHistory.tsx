// src/components/CharacterSheet/UnifiedHistory.tsx
//
// v2.176.0 — Phase Q.0 pt 17: unified character history / timeline.
// Replaces the v2.75 CharacterHistory + v2.93 CombatEventLog + v2.82
// RollHistory triple-section with a single filter-capable feed.
//
// Sources pulled in parallel on mount:
//   1. character_history            — field changes, HP, death saves,
//                                     inspiration, rolls logged via
//                                     triggerRoll({ logHistory })
//   2. combat_events (non-secret)   — attacks, saves, conditions,
//                                     slot usage, concentration, the
//                                     structured v2.93 data
//   3. campaign_chat (DM prompts)   — announcements / save_prompt /
//                                     check_prompt / short_rest_prompt
//                                     / long_rest_completed. Filtered
//                                     by target_character_ids if
//                                     present (v2.173 targeted anno).
//
// Secret rolls (visibility='secret' on combat_events) are excluded
// per product spec — "show all ... except secret rolls". If the DM
// rolled stealthily on the player's behalf, it shouldn't leak into
// the player's personal audit log.
//
// The three sources don't share a schema, so each row is normalized
// to a flat TimelineEvent shape keyed by source:id to avoid id
// collisions across sources. Events are sorted desc by timestamp.
//
// Intentionally simple:
//   • Initial fetch only (no realtime). The three sources realtime
//     publications exist already, but subscribing to all three and
//     merging was judged too much surface area for one ship. User can
//     refresh to pick up new events.
//   • No dedupe. combat_events + character_history BOTH log hp
//     changes (one from combat engine, one from the generic hook), so
//     the same damage might appear twice. Presented as-is; can be
//     cleaned up later if annoying.
//   • No pagination. 200-row limit per source is enough for recent
//     history; older rows drop off the bottom. Again, simple.

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { messageTypeLabel, formatNotificationBody } from '../../lib/notifications';

export interface UnifiedHistoryProps {
  characterId: string;
  campaignId: string | null;
  maxHeight?: number;
}

// ── Normalized event shape ───────────────────────────────────────────

type TimelineKind = 'dm_prompt' | 'hp' | 'roll' | 'save' | 'check' | 'condition' | 'spell' | 'concentration' | 'inspiration' | 'other';

interface TimelineEvent {
  id: string;           // source:raw_id (unique across merged feed)
  at: string;           // ISO timestamp
  kind: TimelineKind;
  title: string;        // bold header line
  detail?: string;      // secondary line
  actor?: string;       // "DM", character name, etc.
  source: 'history' | 'combat' | 'chat';
}

const KIND_COLOR: Record<TimelineKind, string> = {
  dm_prompt: 'var(--c-gold-l)',
  hp: '#f87171',
  roll: '#fbbf24',
  save: '#60a5fa',
  check: '#a78bfa',
  condition: '#f97316',
  spell: '#a78bfa',
  concentration: '#c4b5fd',
  inspiration: 'var(--c-gold-l)',
  other: 'var(--t-3)',
};

const KIND_LABEL: Record<TimelineKind, string> = {
  dm_prompt: 'DM',
  hp: 'HP',
  roll: 'Roll',
  save: 'Save',
  check: 'Check',
  condition: 'Condition',
  spell: 'Spell',
  concentration: 'Conc.',
  inspiration: 'Inspiration',
  other: 'Event',
};

// ── Filter taxonomy ──────────────────────────────────────────────────

type FilterKey = 'all' | 'dm_prompt' | 'hp' | 'rolls' | 'conditions' | 'spells' | 'other';

const FILTERS: { key: FilterKey; label: string; matches: (e: TimelineEvent) => boolean }[] = [
  { key: 'all',         label: 'All',          matches: () => true },
  { key: 'dm_prompt',   label: 'DM Prompts',   matches: (e) => e.kind === 'dm_prompt' },
  { key: 'hp',          label: 'HP & Damage',  matches: (e) => e.kind === 'hp' },
  { key: 'rolls',       label: 'Rolls',        matches: (e) => e.kind === 'roll' || e.kind === 'save' || e.kind === 'check' },
  { key: 'conditions',  label: 'Conditions',   matches: (e) => e.kind === 'condition' || e.kind === 'concentration' || e.kind === 'inspiration' },
  { key: 'spells',      label: 'Spells',       matches: (e) => e.kind === 'spell' },
  { key: 'other',       label: 'Other',        matches: (e) => e.kind === 'other' },
];

// ── Normalizers ──────────────────────────────────────────────────────

function normalizeHistory(row: any): TimelineEvent {
  const t = String(row.event_type ?? 'other');
  // Character history event types: hp_change, field_change, roll, save, check,
  // condition_add, condition_remove, spell_slot, etc. Loose string matching.
  const kind: TimelineKind =
    t.includes('hp') ? 'hp' :
    t === 'roll' ? 'roll' :
    t === 'save' ? 'save' :
    t === 'check' ? 'check' :
    t.includes('condition') ? 'condition' :
    t.includes('spell') ? 'spell' :
    t === 'concentration' || t.includes('conc') ? 'concentration' :
    t.includes('inspiration') ? 'inspiration' :
    'other';
  return {
    id: `history:${row.id}`,
    at: row.created_at,
    kind,
    title: row.description ?? t,
    source: 'history',
  };
}

function normalizeCombatEvent(row: any): TimelineEvent {
  const et = String(row.event_type ?? '');
  const kind: TimelineKind =
    et === 'hp_changed' || et === 'temp_hp_changed' ? 'hp' :
    et === 'generic_roll' ? 'roll' :
    et.startsWith('condition') ? 'condition' :
    et.startsWith('concentration') ? 'concentration' :
    et === 'inspiration_changed' ? 'inspiration' :
    et.startsWith('spell_') ? 'spell' :
    // v2.193.0 — Phase Q.0 pt 34: new emission types from inventory
    // and rest flows. We slot them into existing buckets that filter
    // chips already understand: items go in 'other' (no dedicated
    // chip yet), rests go in 'other' too (history's filter chips
    // are All / DM Prompts / HP / Rolls / Conditions / Spells / Other).
    // Adding dedicated 'item' or 'rest' chips would require a chip
    // schema change — out of scope for this ship.
    et === 'potion_consumed' ? 'hp' :  // potion = healing → HP bucket
    et === 'item_equipped' || et === 'item_unequipped' || et === 'item_used' ? 'other' :
    et === 'rest_taken' ? 'other' :
    et === 'character_field_changed' ? 'other' :
    et === 'exhaustion_changed' ? 'condition' :
    'other';

  const p = row.payload ?? {};
  const actor = row.actor_name ?? null;
  const target = row.target_name ?? null;

  // Short, scannable title per event type. Pull values out of payload.
  let title: string;
  let detail: string | undefined;
  switch (et) {
    case 'hp_changed': {
      const from = p.from_hp ?? '?'; const to = p.to_hp ?? '?';
      const delta = (typeof p.delta === 'number') ? p.delta : null;
      title = `HP ${from} → ${to}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''}`;
      if (p.cause) detail = String(p.cause);
      break;
    }
    case 'temp_hp_changed': {
      title = `Temp HP → ${p.to_temp_hp ?? '?'}`;
      break;
    }
    case 'condition_applied':  title = `Condition applied: ${p.condition ?? '?'}`; break;
    case 'condition_removed':  title = `Condition cleared: ${p.condition ?? '?'}`; break;
    case 'concentration_started': title = `Concentrating on ${p.spell ?? p.spell_name ?? '?'}`; break;
    case 'concentration_broken':  title = `Concentration broken${p.reason ? ` (${p.reason})` : ''}`; break;
    case 'inspiration_changed':   title = p.new_value ? 'Gained Inspiration' : 'Inspiration used'; break;
    case 'spell_slot_used':       title = `Spell slot used — Lvl ${p.level ?? '?'}`; break;
    case 'spell_slot_restored':   title = `Spell slot restored — Lvl ${p.level ?? '?'}`; break;
    case 'exhaustion_changed':    title = `Exhaustion ${p.from ?? 0} → ${p.to ?? 0}`; break;
    case 'generic_roll':          title = p.label ?? 'Roll'; detail = p.total != null ? `Total ${p.total}` : undefined; break;
    case 'character_field_changed': title = p.field ? `Field changed: ${p.field}` : 'Field changed'; break;
    // v2.193.0 — new inventory + rest events.
    case 'potion_consumed': {
      const itemName = p.item_name ?? 'Potion';
      const tgt = p.target === 'self' ? '(self)' : p.target === 'other' ? '(ally)' : '';
      title = `Drank ${itemName} ${tgt}`.trim();
      if (typeof p.heal_total === 'number') detail = `Healed ${p.heal_total}${p.dice_expression ? ` (${p.dice_expression})` : ''}`;
      break;
    }
    case 'item_equipped':   title = `Equipped: ${p.item_name ?? 'item'}`; break;
    case 'item_unequipped': title = `Unequipped: ${p.item_name ?? 'item'}`; break;
    case 'item_used': {
      const sub = p.sub_type;
      if (sub === 'attunement') {
        title = `${p.attuned ? 'Attuned to' : 'Unattuned'} ${p.item_name ?? 'item'}`;
      } else if (sub === 'charge_spent') {
        title = `Spent charge: ${p.item_name ?? 'item'}`;
        if (typeof p.charges_after === 'number' && typeof p.charges_max === 'number') {
          detail = `${p.charges_after}/${p.charges_max} charges remaining`;
        }
      } else if (sub === 'charge_recharged') {
        // v2.204.0 — Phase Q.0 pt 44: per-item recharge events.
        // Title: "Recharged: Wand of Fireballs"
        // Detail: "+4 charges (1d6+1) → 7/7"
        title = `Recharged: ${p.item_name ?? 'item'}`;
        const bits: string[] = [];
        if (typeof p.charges_regained === 'number') {
          bits.push(`+${p.charges_regained} charges`);
        }
        if (p.recharge_dice) bits.push(`(${p.recharge_dice})`);
        if (typeof p.charges_after === 'number' && typeof p.charges_max === 'number') {
          bits.push(`→ ${p.charges_after}/${p.charges_max}`);
        }
        if (bits.length) detail = bits.join(' ');
      } else {
        title = `Used: ${p.item_name ?? 'item'}`;
      }
      break;
    }
    case 'rest_taken': {
      const kind = p.rest_kind === 'long' ? 'Long' : p.rest_kind === 'short' ? 'Short' : '';
      title = `${kind} Rest`.trim();
      const bits: string[] = [];
      if (p.rest_kind === 'short' && typeof p.hp_gained === 'number' && p.hp_gained > 0) bits.push(`+${p.hp_gained} HP`);
      if (p.rest_kind === 'long' && typeof p.hd_recovered === 'number') bits.push(`+${p.hd_recovered} HD`);
      if (p.rest_kind === 'long' && p.exhaustion_before !== p.exhaustion_after) bits.push(`Exh ${p.exhaustion_before}→${p.exhaustion_after}`);
      if (p.dm_initiated) bits.push('DM-called');
      if (bits.length) detail = bits.join(' · ');
      break;
    }
    default: title = et.replace(/_/g, ' ');
  }

  return {
    id: `combat:${row.id}`,
    at: row.created_at,
    kind,
    title,
    detail,
    actor: actor !== target ? actor : undefined,
    source: 'combat',
  };
}

function normalizeChatEvent(row: any): TimelineEvent | null {
  // Only surface DM-relevant prompts; skip plain 'text' chat (lives
  // in the chat panel, not history) and player auto-status events
  // that the player already saw as a toast when it happened.
  const DM_PROMPT_TYPES = new Set([
    'announcement', 'save_prompt', 'check_prompt',
    'short_rest_prompt', 'long_rest_completed',
  ]);
  if (!DM_PROMPT_TYPES.has(row.message_type)) return null;
  return {
    id: `chat:${row.id}`,
    at: row.created_at,
    kind: 'dm_prompt',
    title: messageTypeLabel(row.message_type),
    detail: formatNotificationBody(row.message_type, row.message),
    actor: row.character_name ?? 'DM',
    source: 'chat',
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function UnifiedHistory({ characterId, campaignId, maxHeight = 560 }: UnifiedHistoryProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const LIMIT_HISTORY = 200;
    const LIMIT_COMBAT = 200;
    const LIMIT_CHAT = 100;

    // Parallel fetch. Each promise resolves to { data, error } from supabase;
    // we tolerate individual source failures so a broken table doesn't blank
    // the whole timeline.
    const pHistory = supabase
      .from('character_history')
      .select('id, event_type, description, created_at')
      .eq('character_id', characterId)
      .order('created_at', { ascending: false })
      .limit(LIMIT_HISTORY);

    // combat_events are scoped to the whole campaign, so filter client-side
    // on actor_id or target_id = this character. visibility='secret' rows
    // are dropped per spec. We could push the visibility filter server-side,
    // but keeping it inline keeps the normalization logic in one place.
    const pCombat = campaignId
      ? supabase
          .from('combat_events')
          .select('id, event_type, actor_id, actor_name, actor_type, target_id, target_name, target_type, payload, visibility, created_at')
          .eq('campaign_id', campaignId)
          .or(`actor_id.eq.${characterId},target_id.eq.${characterId}`)
          .neq('visibility', 'secret')
          .order('created_at', { ascending: false })
          .limit(LIMIT_COMBAT)
      : Promise.resolve({ data: [] as any[], error: null } as const);

    const pChat = campaignId
      ? supabase
          .from('campaign_chat')
          .select('id, message, message_type, character_name, created_at')
          .eq('campaign_id', campaignId)
          .in('message_type', ['announcement', 'save_prompt', 'check_prompt', 'short_rest_prompt', 'long_rest_completed'])
          .order('created_at', { ascending: false })
          .limit(LIMIT_CHAT)
      : Promise.resolve({ data: [] as any[], error: null } as const);

    Promise.all([pHistory, pCombat, pChat]).then(([hr, cr, chr]) => {
      if (cancelled) return;
      const merged: TimelineEvent[] = [];

      (hr.data ?? []).forEach(row => merged.push(normalizeHistory(row)));
      (cr.data ?? []).forEach(row => merged.push(normalizeCombatEvent(row)));

      // Filter targeted announcements: if the payload carries a
      // targets array and this character isn't in it, skip.
      (chr.data ?? []).forEach(row => {
        if (row.message_type === 'announcement') {
          try {
            const p = JSON.parse(row.message);
            if (p && Array.isArray(p.targets) && p.targets.length > 0 && !p.targets.includes(characterId)) {
              return; // not for this character
            }
          } catch { /* plain text = send to all */ }
        }
        const evt = normalizeChatEvent(row);
        if (evt) merged.push(evt);
      });

      merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      // v2.199.0 — Phase Q.0 pt 40: HP-row deduplication.
      // The same HP change is logged to both character_history (legacy
      // path, writes 'hp_change' rows) AND combat_events (Phase A
      // unified log, writes 'hp_changed' rows with richer payload).
      // Result: two near-identical rows side by side on the History
      // tab for every damage / heal. We drop the character_history
      // row when a combat_events row of the same kind exists within
      // a narrow time window, preferring the combat one because:
      //   1. payload is structured (from_hp / to_hp / delta) instead
      //      of free-text "HP 12 → 7 (-5)" so future filtering /
      //      grouping can use the data;
      //   2. it carries actor + cause when known (damage source,
      //      condition trigger, etc.) which character_history doesn't;
      //   3. emissions are in active development, while
      //      character_history is the legacy path being phased out.
      //
      // Window: 3 seconds. Both writes happen in the same tick of the
      // damage / heal handler so the timestamps are usually within
      // ~50ms; 3s is a generous buffer for slow DB latency.
      const DEDUP_WINDOW_MS = 3000;
      const combatHpTimestamps: number[] = [];
      for (const e of merged) {
        if (e.source === 'combat' && e.kind === 'hp') {
          combatHpTimestamps.push(new Date(e.at).getTime());
        }
      }
      const dedupedMerged = merged.filter(e => {
        if (e.source !== 'history') return true;
        if (e.kind !== 'hp') return true;
        const t = new Date(e.at).getTime();
        // Drop history HP row if a combat HP row exists within window
        return !combatHpTimestamps.some(ct => Math.abs(ct - t) <= DEDUP_WINDOW_MS);
      });

      setEvents(dedupedMerged);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [characterId, campaignId]);

  const filtered = useMemo(() => {
    const fn = FILTERS.find(f => f.key === filter)?.matches ?? (() => true);
    return events.filter(fn);
  }, [events, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count = f.key === 'all' ? events.length : events.filter(f.matches).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                cursor: 'pointer', minHeight: 0,
                border: `1px solid ${active ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`,
                background: active ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {f.label}
              <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div
        style={{
          maxHeight, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 4,
          paddingRight: 2,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--t-3)', fontSize: 12 }}>
            Loading timeline…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--t-3)', fontSize: 12 }}>
            No events match this filter.
          </div>
        ) : (
          filtered.map(e => <EventRow key={e.id} e={e} />)
        )}
      </div>
    </div>
  );
}

function EventRow({ e }: { e: TimelineEvent }) {
  const color = KIND_COLOR[e.kind];
  const label = KIND_LABEL[e.kind];
  const t = new Date(e.at);
  const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = t.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '60px 80px 1fr', gap: 10,
        alignItems: 'center',
        padding: '7px 10px',
        borderRadius: 6,
        background: '#080d14',
        borderLeft: `3px solid ${color}`,
        flexShrink: 0,
      }}
    >
      {/* Time */}
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', lineHeight: 1.3 }}>
        <div style={{ fontWeight: 700, color: 'var(--t-2)' }}>{timeStr}</div>
        <div>{dateStr}</div>
      </div>
      {/* Kind badge */}
      <div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          color, background: `${color}1a`, border: `1px solid ${color}55`,
          padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' as const,
        }}>
          {label}
        </span>
      </div>
      {/* Title + detail */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-1)', lineHeight: 1.4, wordBreak: 'break-word' as const }}>
          {e.title}
        </div>
        {e.detail && (
          <div style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4, marginTop: 1, wordBreak: 'break-word' as const }}>
            {e.detail}
          </div>
        )}
        {e.actor && e.actor !== 'DM' && (
          <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, fontStyle: 'italic' as const }}>
            by {e.actor}
          </div>
        )}
      </div>
    </div>
  );
}
