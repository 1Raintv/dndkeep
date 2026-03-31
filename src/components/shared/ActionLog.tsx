import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

export interface ActionLogEntry {
  id: string;
  character_name: string;
  action_type: string;
  action_name: string;
  target_name: string;
  dice_expression: string;
  individual_results: number[];
  total: number;
  hit_result: string;
  notes: string;
  created_at: string;
}

interface ActionLogProps {
  campaignId?: string | null;
  characterId?: string | null;
  /** 'campaign' shows all party actions, 'character' shows only this character */
  mode?: 'campaign' | 'character';
  maxHeight?: number;
}

const TYPE_COLORS: Record<string, string> = {
  attack:  'var(--color-crimson-bright)',
  spell:   '#a78bfa',
  heal:    'var(--hp-full)',
  damage:  '#fb923c',
  roll:    'var(--color-gold-bright)',
  save:    '#60a5fa',
  check:   'var(--text-secondary)',
};

const TYPE_ICONS: Record<string, string> = {
  attack: '⚔️', spell: '✨', heal: '💚', damage: '💥',
  roll: '🎲', save: '🛡️', check: '🎯',
};

function entryColor(entry: ActionLogEntry) {
  return TYPE_COLORS[entry.action_type] ?? 'var(--text-secondary)';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function logAction(params: {
  campaignId?: string | null;
  characterId: string;
  characterName: string;
  actionType: 'attack' | 'spell' | 'heal' | 'damage' | 'roll' | 'save' | 'check';
  actionName: string;
  targetName?: string;
  diceExpression?: string;
  individualResults?: number[];
  total?: number;
  hitResult?: 'hit' | 'miss' | 'crit' | 'fumble' | '';
  notes?: string;
}) {
  return supabase.from('action_logs').insert({
    campaign_id: params.campaignId ?? null,
    character_id: params.characterId,
    character_name: params.characterName,
    action_type: params.actionType,
    action_name: params.actionName,
    target_name: params.targetName ?? '',
    dice_expression: params.diceExpression ?? '',
    individual_results: params.individualResults ?? [],
    total: params.total ?? 0,
    hit_result: params.hitResult ?? '',
    notes: params.notes ?? '',
  });
}

export default function ActionLog({ campaignId, characterId, mode = 'campaign', maxHeight = 480 }: ActionLogProps) {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'attack' | 'spell' | 'roll' | 'heal'>('all');
  const [newEntry, setNewEntry] = useState<ActionLogEntry | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEntries();

    const channelId = campaignId ? `action-log-campaign-${campaignId}` : `action-log-char-${characterId}`;
    const filter = campaignId
      ? { event: 'INSERT' as const, schema: 'public', table: 'action_logs', filter: `campaign_id=eq.${campaignId}` }
      : { event: 'INSERT' as const, schema: 'public', table: 'action_logs', filter: `character_id=eq.${characterId}` };

    const channel = supabase.channel(channelId).on('postgres_changes', filter, payload => {
      const entry = payload.new as ActionLogEntry;
      setEntries(prev => [entry, ...prev].slice(0, 100));
      setNewEntry(entry);
      setTimeout(() => setNewEntry(null), 3000);
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId, characterId]);

  async function loadEntries() {
    let query = supabase
      .from('action_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (campaignId) query = query.eq('campaign_id', campaignId);
    else if (characterId) query = query.eq('character_id', characterId);

    const { data } = await query;
    if (data) setEntries(data as ActionLogEntry[]);
    setLoading(false);
  }

  async function clearLog() {
    let query = supabase.from('action_logs').delete();
    if (campaignId) query = (query as any).eq('campaign_id', campaignId);
    else if (characterId) query = (query as any).eq('character_id', characterId);
    await query;
    setEntries([]);
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.action_type === filter);

  if (loading) return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', padding: 'var(--space-4)' }}>
      <div className="spinner" style={{ width: 14, height: 14 }} />
      <span className="loading-text">Loading log…</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'attack', 'spell', 'roll', 'heal'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontFamily: 'var(--font-heading)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                border: filter === f ? `1px solid ${f === 'all' ? 'var(--border-gold)' : TYPE_COLORS[f]}` : '1px solid var(--border-subtle)',
                background: filter === f ? (f === 'all' ? 'rgba(201,146,42,0.1)' : `${TYPE_COLORS[f]}15`) : 'transparent',
                color: filter === f ? (f === 'all' ? 'var(--text-gold)' : TYPE_COLORS[f]) : 'var(--text-muted)',
              }}
            >
              {f === 'all' ? 'All' : TYPE_ICONS[f]} {f !== 'all' && f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>
            {filtered.length} entries
          </span>
          {entries.length > 0 && (
            <button
              onClick={clearLog}
              style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--color-crimson-bright)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* New entry flash */}
      {newEntry && (
        <div className="animate-fade-in" style={{
          padding: 'var(--space-2) var(--space-3)',
          background: `${entryColor(newEntry)}15`,
          border: `1px solid ${entryColor(newEntry)}50`,
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)',
          color: entryColor(newEntry),
        }}>
          🔔 {newEntry.character_name}: {newEntry.action_name}
          {newEntry.target_name && ` → ${newEntry.target_name}`}
          {newEntry.total > 0 && ` [${newEntry.total}]`}
        </div>
      )}

      {/* Log entries */}
      <div style={{ maxHeight, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            No actions logged yet.<br />
            <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7 }}>Attacks, spells, and rolls will appear here in real-time.</span>
          </div>
        ) : (
          filtered.map(entry => (
            <LogEntry key={entry.id} entry={entry} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: ActionLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = entryColor(entry);
  const icon = TYPE_ICONS[entry.action_type] ?? '•';

  return (
    <div
      onClick={() => entry.individual_results?.length > 1 && setExpanded(e => !e)}
      style={{
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid transparent',
        background: 'var(--bg-sunken)',
        cursor: entry.individual_results?.length > 1 ? 'pointer' : 'default',
        transition: 'all var(--transition-fast)',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {/* Time */}
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, minWidth: 48 }}>
          {formatTime(entry.created_at)}
        </span>

        {/* Character name */}
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)', color }}>
          {icon} {entry.character_name}
        </span>

        {/* Action */}
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {entry.action_name}
        </span>

        {/* Target */}
        {entry.target_name && (
          <>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>→</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--color-gold-bright)', fontWeight: 700 }}>
              {entry.target_name}
            </span>
          </>
        )}

        {/* Hit result badge */}
        {entry.hit_result && (
          <span style={{
            fontFamily: 'var(--font-heading)', fontSize: 8, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '1px 5px', borderRadius: 3,
            color: entry.hit_result === 'crit' ? 'var(--color-gold-bright)' : entry.hit_result === 'miss' || entry.hit_result === 'fumble' ? 'var(--color-crimson-bright)' : 'var(--hp-full)',
            background: entry.hit_result === 'crit' ? 'rgba(201,146,42,0.15)' : entry.hit_result === 'miss' || entry.hit_result === 'fumble' ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
          }}>
            {entry.hit_result}
          </span>
        )}

        {/* Total */}
        {entry.total > 0 && (
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-md)',
            color, marginLeft: 'auto', flexShrink: 0,
          }}>
            {entry.total}
          </span>
        )}
      </div>

      {/* Dice expression */}
      {entry.dice_expression && (
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2, marginLeft: 56 }}>
          {entry.dice_expression}
          {entry.individual_results?.length > 0 && ` [${entry.individual_results.join(', ')}]`}
        </div>
      )}

      {/* Notes */}
      {entry.notes && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, marginLeft: 56, fontStyle: 'italic' }}>
          {entry.notes}
        </div>
      )}
    </div>
  );
}
