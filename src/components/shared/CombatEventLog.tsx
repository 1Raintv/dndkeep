// v2.93.0 — Phase A of the Combat Backbone
//
// Unified campaign + per-character action log reading from `combat_events`.
// Supersedes the old `action_logs`-only view with proper actor-type filters
// (Player / DM / NPC / Monster), event-type chips, and chain-aware rendering.
//
// This runs IN PARALLEL with the existing `ActionLog` component during the
// Phase A transition. Once all write paths are migrated (Phase A → B), the
// old `ActionLog` and its `action_log_reactions` table can be retired.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { CombatEventRow, CombatEventType, ActorType } from '../../lib/combatEvents';

type ActorFilter = 'all' | 'player' | 'dm' | 'npc' | 'monster';
type EventFilter = 'all' | 'combat' | 'spell' | 'damage' | 'heal' | 'resource' | 'condition';

interface Props {
  campaignId?: string | null;
  characterId?: string | null;    // if set → per-character view (filter by actor_id)
  mode?: 'campaign' | 'character';
  maxHeight?: number;
}

// Group event types into high-level filter buckets
const EVENT_GROUPS: Record<EventFilter, Set<CombatEventType>> = {
  all: new Set(),  // special case handled in filter
  combat: new Set<CombatEventType>([
    'attack_declared', 'attack_roll', 'damage_rolled', 'damage_pending',
    'damage_applied', 'save_requested', 'save_rolled', 'ability_check_rolled',
    'reaction_used', 'initiative_rolled', 'turn_started', 'turn_ended',
    'combat_started', 'combat_ended', 'movement', 'standard_action_taken',
    'generic_roll',
  ]),
  spell: new Set<CombatEventType>([
    'spell_cast', 'spell_effect_placed', 'spell_effect_removed',
    'concentration_started', 'concentration_broken',
  ]),
  damage: new Set<CombatEventType>([
    'damage_rolled', 'damage_pending', 'damage_applied',
    'dropped_to_0_hp', 'damage_at_0_hp_failure_added', 'died',
  ]),
  heal: new Set<CombatEventType>([
    'healing_applied', 'temp_hp_gained', 'stabilized', 'revived',
  ]),
  resource: new Set<CombatEventType>([
    'spell_slot_used', 'spell_slot_restored', 'hp_changed', 'temp_hp_changed',
    'inspiration_changed', 'potion_consumed', 'item_used', 'item_equipped',
    'item_unequipped', 'rest_taken', 'leveled_up',
  ]),
  condition: new Set<CombatEventType>([
    'condition_applied', 'condition_removed', 'exhaustion_changed',
    'death_save_rolled', 'death_save_turn_prompt',
  ]),
};

// Color + icon per event type bucket
function visualForEvent(evtType: CombatEventType): { color: string; icon: string } {
  if (EVENT_GROUPS.damage.has(evtType)) return { color: '#fb923c', icon: '💥' };
  if (EVENT_GROUPS.heal.has(evtType))   return { color: 'var(--hp-full)', icon: '💚' };
  if (EVENT_GROUPS.spell.has(evtType))  return { color: '#a78bfa', icon: '✨' };
  if (evtType === 'attack_roll' || evtType === 'attack_declared') return { color: 'var(--c-red-l)', icon: '⚔️' };
  if (evtType === 'save_rolled' || evtType === 'save_requested')  return { color: '#60a5fa', icon: '🛡️' };
  if (evtType === 'ability_check_rolled') return { color: 'var(--t-2)', icon: '🎯' };
  if (EVENT_GROUPS.condition.has(evtType)) return { color: '#f472b6', icon: '⚠️' };
  if (EVENT_GROUPS.resource.has(evtType))  return { color: 'var(--c-gold-l)', icon: '⚡' };
  if (evtType === 'initiative_rolled' || evtType === 'turn_started' || evtType === 'turn_ended' || evtType === 'combat_started' || evtType === 'combat_ended') {
    return { color: 'var(--c-gold-l)', icon: '⏱️' };
  }
  return { color: 'var(--t-2)', icon: '•' };
}

// Actor badge color
const ACTOR_COLORS: Record<ActorType, string> = {
  player: 'var(--c-gold-l)',
  dm: '#f87171',
  npc: '#34d399',
  monster: '#a78bfa',
  system: 'var(--t-2)',
};

const ACTOR_LABELS: Record<ActorType, string> = {
  player: 'Player',
  dm: 'DM',
  npc: 'NPC',
  monster: 'Monster',
  system: 'System',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Render a human-readable summary from an event's payload
function summarizeEvent(evt: CombatEventRow): string {
  const p = evt.payload ?? {};
  // Legacy action_logs migration: we stored action_name in payload
  const actionName = (p.action_name as string) || '';
  const desc = (p.description as string) || '';
  if (actionName) return actionName;
  if (desc) return desc;
  // Fallback: humanize the event_type
  return evt.event_type.replace(/_/g, ' ');
}

function rollSummary(evt: CombatEventRow): string | null {
  const p = evt.payload ?? {};
  const dice = (p.dice_expression as string) || '';
  const results = (p.individual_results as number[] | undefined) ?? [];
  if (!dice && results.length === 0) return null;
  if (results.length > 0) return `${dice} [${results.join(', ')}]`;
  return dice;
}

function hitBadge(evt: CombatEventRow): string | null {
  const p = evt.payload ?? {};
  const hit = (p.hit_result as string) || '';
  return hit || null;
}

function total(evt: CombatEventRow): number | null {
  const p = evt.payload ?? {};
  const t = p.total;
  return typeof t === 'number' && t > 0 ? t : null;
}

// v2.164.0 — Phase Q.0 pt 5: bumped default maxHeight from 560 → 720
// for better DM-screen readability. Combined with the 8/9/10 → 11/12/13
// font-size bumps, the log is now actually scannable from across the
// table during a session.
export default function CombatEventLog({ campaignId, characterId, mode = 'campaign', maxHeight = 720 }: Props) {
  const [events, setEvents] = useState<CombatEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actorFilter, setActorFilter] = useState<ActorFilter>('all');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [flash, setFlash] = useState<CombatEventRow | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    load();
    // Realtime: new INSERTs on combat_events scoped to this campaign/character
    const filterExpr = campaignId
      ? `campaign_id=eq.${campaignId}`
      : characterId
        ? `actor_id=eq.${characterId}`
        : undefined;
    const channelName = `combat-events-${campaignId ?? characterId ?? 'all'}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes',
        filterExpr
          ? { event: 'INSERT', schema: 'public', table: 'combat_events', filter: filterExpr }
          : { event: 'INSERT', schema: 'public', table: 'combat_events' },
        (payload) => {
          const row = payload.new as CombatEventRow;
          setEvents((prev) => [row, ...prev].slice(0, 200));
          setFlash(row);
          setTimeout(() => setFlash(null), 3500);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, characterId]);

  async function load() {
    let q = supabase
      .from('combat_events')
      .select('id,campaign_id,encounter_id,chain_id,sequence,parent_event_id,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,payload,visibility,legacy_source,legacy_id,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    else if (characterId) q = q.eq('actor_id', characterId);
    const { data, error } = await q;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[combatEventLog] load failed:', error.message);
      setLoading(false);
      return;
    }
    setEvents((data ?? []) as CombatEventRow[]);
    setLoading(false);
  }

  // Apply filters
  const filtered = events.filter((e) => {
    if (actorFilter !== 'all' && e.actor_type !== actorFilter) return false;
    if (eventFilter !== 'all') {
      const bucket = EVENT_GROUPS[eventFilter];
      if (!bucket.has(e.event_type)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-4)' }}>
        <div className="spinner" style={{ width: 14, height: 14 }} />
        <span className="loading-text">Loading log…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Actor-type filter tabs (Phase A headline feature) */}
      {mode === 'campaign' && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-2)' }}>
          {(['all', 'player', 'dm', 'npc', 'monster'] as ActorFilter[]).map((f) => {
            const active = actorFilter === f;
            const color = f === 'all' ? 'var(--c-gold-l)' : ACTOR_COLORS[f as ActorType];
            const label = f === 'all' ? 'All' : ACTOR_LABELS[f as ActorType] + 's';
            const count = f === 'all' ? events.length : events.filter((e) => e.actor_type === f).length;
            return (
              <button
                key={f}
                onClick={() => setActorFilter(f)}
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                  border: active ? `1px solid ${color}` : '1px solid var(--c-border)',
                  background: active ? `${color}20` : 'transparent',
                  color: active ? color : 'var(--t-2)',
                  minHeight: 0,
                }}
              >
                {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Event-type sub-filter chips */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'combat', 'spell', 'damage', 'heal', 'resource', 'condition'] as EventFilter[]).map((f) => {
            const active = eventFilter === f;
            return (
              <button
                key={f}
                onClick={() => setEventFilter(f)}
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: active ? '1px solid var(--c-gold-l)' : '1px solid var(--c-border)',
                  background: active ? 'var(--c-gold-bg)' : 'transparent',
                  color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
                  minHeight: 0,
                }}
              >
                {f === 'all' ? 'All types' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            );
          })}
        </div>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
          {filtered.length} entries
        </span>
      </div>

      {/* Flash banner for newly inserted event */}
      {flash && (
        <div
          className="animate-fade-in"
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            background: `${visualForEvent(flash.event_type).color}15`,
            border: `1px solid ${visualForEvent(flash.event_type).color}50`,
            borderRadius: 'var(--r-md)',
            fontFamily: 'var(--ff-body)',
            fontSize: 13,
            color: visualForEvent(flash.event_type).color,
          }}
        >
          🔔 {flash.actor_name}: {summarizeEvent(flash)}
          {flash.target_name ? ` → ${flash.target_name}` : ''}
        </div>
      )}

      {/* Log entries */}
      <div
        ref={listRef}
        style={{
          maxHeight, overflowY: 'auto',
          // v2.164.0: bumped gap 3 → 6 to give larger text breathing room
          display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 'var(--sp-8)',
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)',
          }}>
            No events match these filters.<br />
            <span style={{ fontSize: 13, opacity: 0.7 }}>Events appear here in real-time as players and DMs act.</span>
          </div>
        ) : filtered.map((evt) => <EventRow key={evt.id} evt={evt} showActor={mode === 'campaign'} />)}
      </div>
    </div>
  );
}

function EventRow({ evt, showActor }: { evt: CombatEventRow; showActor: boolean }) {
  const visual = visualForEvent(evt.event_type);
  const summary = summarizeEvent(evt);
  const rolls = rollSummary(evt);
  const hit = hitBadge(evt);
  const tot = total(evt);
  const isCrit = hit === 'crit';
  const isMiss = hit === 'miss' || hit === 'fumble';

  return (
    <div style={{
      borderRadius: 'var(--r-sm)',
      background: '#080d14',
      borderLeft: `3px solid ${visual.color}`,
      overflow: 'hidden',
      // v2.169.0 — Phase Q.0 pt 10: without flexShrink:0 these rows
      // collapse to zero height when the list's intrinsic content
      // exceeds its maxHeight inside a flex-column parent. Manifests
      // as the History tab's Combat Events section looking empty
      // even though 100+ events are in the DOM. Smoke-test bug #2.
      flexShrink: 0,
    }}>
      <div style={{ padding: 'var(--sp-2) var(--sp-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', flexShrink: 0, minWidth: 48 }}>
            {formatTime(evt.created_at)}
          </span>

          {/* Actor-type chip (campaign view only) */}
          {showActor && (
            <span style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '1px 6px', borderRadius: 3,
              color: ACTOR_COLORS[evt.actor_type],
              background: `${ACTOR_COLORS[evt.actor_type]}20`,
              border: `1px solid ${ACTOR_COLORS[evt.actor_type]}40`,
            }}>
              {ACTOR_LABELS[evt.actor_type]}
            </span>
          )}

          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: visual.color }}>
            {visual.icon} {evt.actor_name}
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)' }}>
            {summary}
          </span>
          {evt.target_name && (
            <>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)' }}>→</span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--c-gold-l)', fontWeight: 700 }}>
                {evt.target_name}
              </span>
            </>
          )}
          {hit && (
            <span style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 3,
              color: isCrit ? 'var(--c-gold-l)' : isMiss ? 'var(--c-red-l)' : 'var(--hp-full)',
              background: isCrit ? 'rgba(201,146,42,0.15)' : isMiss ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
            }}>
              {hit}
            </span>
          )}
          {tot != null && (
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-md)', color: visual.color, marginLeft: 'auto', flexShrink: 0 }}>
              {tot}
            </span>
          )}
        </div>

        {rolls && (
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', marginTop: 2, marginLeft: 56 }}>
            {rolls}
          </div>
        )}

        {evt.visibility === 'hidden_from_players' && (
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            marginTop: 3, marginLeft: 56,
            color: '#f87171',
          }}>
            🔒 DM-only
          </div>
        )}
      </div>
    </div>
  );
}
