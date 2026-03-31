import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

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

interface Reaction { emoji: string; count: number; myReaction: boolean; }
interface ReactionMap { [logId: string]: Reaction[]; }

interface ActionLogProps {
  campaignId?: string | null;
  characterId?: string | null;
  mode?: 'campaign' | 'character';
  maxHeight?: number;
}

const TYPE_COLORS: Record<string, string> = {
  attack: 'var(--color-crimson-bright)', spell: '#a78bfa',
  heal: 'var(--hp-full)', damage: '#fb923c',
  roll: 'var(--color-gold-bright)', save: '#60a5fa', check: 'var(--text-secondary)',
};
const TYPE_ICONS: Record<string, string> = {
  attack: '⚔️', spell: '✨', heal: '💚', damage: '💥', roll: '🎲', save: '🛡️', check: '🎯',
};
const QUICK_EMOJIS = ['🎉', '🔥', '💀', '😬', '⭐', '💔', '🐉', '👀'];

function entryColor(e: ActionLogEntry) { return TYPE_COLORS[e.action_type] ?? 'var(--text-secondary)'; }
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function logAction(params: {
  campaignId?: string | null; characterId: string; characterName: string;
  actionType: 'attack' | 'spell' | 'heal' | 'damage' | 'roll' | 'save' | 'check';
  actionName: string; targetName?: string; diceExpression?: string;
  individualResults?: number[]; total?: number;
  hitResult?: 'hit' | 'miss' | 'crit' | 'fumble' | ''; notes?: string;
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
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'attack' | 'spell' | 'roll' | 'heal'>('all');
  const [newEntry, setNewEntry] = useState<ActionLogEntry | null>(null);

  useEffect(() => {
    loadAll();
    const channelFilter = campaignId
      ? `campaign_id=eq.${campaignId}`
      : `character_id=eq.${characterId}`;

    const ch = supabase.channel(`action-log-${campaignId ?? characterId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'action_logs', filter: channelFilter }, payload => {
        const entry = payload.new as ActionLogEntry;
        setEntries(prev => [entry, ...prev].slice(0, 100));
        setNewEntry(entry);
        setTimeout(() => setNewEntry(null), 4000);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_log_reactions' }, () => {
        loadReactions();
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [campaignId, characterId]);

  async function loadAll() {
    let q = supabase.from('action_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    else if (characterId) q = q.eq('character_id', characterId);
    const { data } = await q;
    if (data) setEntries(data as ActionLogEntry[]);
    setLoading(false);
    loadReactions(data?.map((e: ActionLogEntry) => e.id));
  }

  async function loadReactions(ids?: string[]) {
    const targetIds = ids ?? entries.map(e => e.id);
    if (!targetIds.length) return;
    const { data } = await supabase.from('action_log_reactions').select('*').in('log_id', targetIds);
    if (!data) return;
    const map: ReactionMap = {};
    for (const r of data) {
      if (!map[r.log_id]) map[r.log_id] = [];
      const existing = map[r.log_id].find((x: Reaction) => x.emoji === r.emoji);
      if (existing) {
        existing.count++;
        if (r.user_id === user?.id) existing.myReaction = true;
      } else {
        map[r.log_id].push({ emoji: r.emoji, count: 1, myReaction: r.user_id === user?.id });
      }
    }
    setReactions(map);
  }

  async function toggleReaction(logId: string, emoji: string) {
    if (!user?.id) return;
    const myReactions = reactions[logId]?.filter(r => r.myReaction);
    const alreadyReacted = myReactions?.some(r => r.emoji === emoji);
    if (alreadyReacted) {
      await supabase.from('action_log_reactions').delete()
        .eq('log_id', logId).eq('user_id', user.id).eq('emoji', emoji);
    } else {
      await supabase.from('action_log_reactions').insert({
        log_id: logId, user_id: user.id,
        character_name: profile?.display_name ?? 'Unknown', emoji,
      });
    }
  }

  async function clearLog() {
    let q = supabase.from('action_logs').delete() as any;
    if (campaignId) q = q.eq('campaign_id', campaignId);
    else if (characterId) q = q.eq('character_id', characterId);
    await q;
    setEntries([]);
    setReactions({});
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.action_type === filter);

  if (loading) return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', padding: 'var(--space-4)' }}>
      <div className="spinner" style={{ width: 14, height: 14 }} /><span className="loading-text">Loading log…</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'attack', 'spell', 'roll', 'heal'] as const).map(f => {
            const active = filter === f;
            const color = f === 'all' ? 'var(--text-gold)' : TYPE_COLORS[f];
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: 'var(--font-heading)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                border: active ? `1px solid ${color}` : '1px solid var(--border-subtle)',
                background: active ? `${color}20` : 'transparent',
                color: active ? color : 'var(--text-muted)',
              }}>
                {f === 'all' ? 'All' : `${TYPE_ICONS[f]} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>{filtered.length} entries</span>
          {entries.length > 0 && (
            <button onClick={clearLog} style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--color-crimson-bright)', background: 'none', border: 'none', cursor: 'pointer' }}>
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
          fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: entryColor(newEntry),
        }}>
          🔔 {newEntry.character_name}: {newEntry.action_name}
          {newEntry.target_name && ` → ${newEntry.target_name}`}
          {newEntry.total > 0 && ` [${newEntry.total}]`}
        </div>
      )}

      {/* Log entries */}
      <div style={{ maxHeight, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            No actions logged yet.<br />
            <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7 }}>Attacks, spells, and rolls appear here in real-time.</span>
          </div>
        ) : filtered.map(entry => (
          <LogEntry
            key={entry.id}
            entry={entry}
            entryReactions={reactions[entry.id] ?? []}
            onReact={(emoji) => toggleReaction(entry.id, emoji)}
          />
        ))}
      </div>
    </div>
  );
}

interface LogEntryProps {
  entry: ActionLogEntry;
  entryReactions: Reaction[];
  onReact: (emoji: string) => void;
}

function LogEntry({ entry, entryReactions, onReact }: LogEntryProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const color = entryColor(entry);
  const icon = TYPE_ICONS[entry.action_type] ?? '•';
  const isCrit = entry.hit_result === 'crit';
  const isMiss = entry.hit_result === 'miss' || entry.hit_result === 'fumble';

  return (
    <div style={{
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-sunken)',
      borderLeft: `3px solid ${color}`,
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, minWidth: 48 }}>
            {formatTime(entry.created_at)}
          </span>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)', color }}>
            {icon} {entry.character_name}
          </span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            {entry.action_name}
          </span>
          {entry.target_name && (
            <>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>→</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--color-gold-bright)', fontWeight: 700 }}>
                {entry.target_name}
              </span>
            </>
          )}
          {entry.hit_result && (
            <span style={{
              fontFamily: 'var(--font-heading)', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 3,
              color: isCrit ? 'var(--color-gold-bright)' : isMiss ? 'var(--color-crimson-bright)' : 'var(--hp-full)',
              background: isCrit ? 'rgba(201,146,42,0.15)' : isMiss ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
            }}>
              {entry.hit_result}
            </span>
          )}
          {entry.total > 0 && (
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-md)', color, marginLeft: 'auto', flexShrink: 0 }}>
              {entry.total}
            </span>
          )}
        </div>

        {entry.dice_expression && (
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2, marginLeft: 56 }}>
            {entry.dice_expression}
            {entry.individual_results?.length > 0 && ` [${entry.individual_results.join(', ')}]`}
          </div>
        )}
        {entry.notes && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, marginLeft: 56, fontStyle: 'italic' }}>
            {entry.notes}
          </div>
        )}
      </div>

      {/* Reactions row */}
      <div style={{
        padding: '3px var(--space-3) 5px 56px',
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        minHeight: entryReactions.length > 0 || showEmojiPicker ? 'auto' : 0,
      }}>
        {/* Existing reactions */}
        {entryReactions.map(r => (
          <button
            key={r.emoji}
            onClick={(e) => { e.stopPropagation(); onReact(r.emoji); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', borderRadius: 99,
              border: r.myReaction ? '1px solid var(--color-gold-dim)' : '1px solid var(--border-subtle)',
              background: r.myReaction ? 'rgba(201,146,42,0.12)' : 'var(--bg-raised)',
              cursor: 'pointer', fontSize: 13, lineHeight: 1.4,
              transition: 'all var(--transition-fast)',
            }}
          >
            {r.emoji}
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 10, color: r.myReaction ? 'var(--text-gold)' : 'var(--text-muted)' }}>
              {r.count}
            </span>
          </button>
        ))}

        {/* Add reaction button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(p => !p); }}
            style={{
              padding: '1px 5px', borderRadius: 99, fontSize: 12, lineHeight: 1.4,
              border: '1px solid var(--border-subtle)', background: 'transparent',
              cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.6,
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'}
          >
            +😀
          </button>
          {showEmojiPicker && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                background: 'var(--color-charcoal)',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2)',
                display: 'flex', gap: 4, flexWrap: 'wrap',
                width: 180, zIndex: 100,
                boxShadow: 'var(--shadow-lg), var(--shadow-gold)',
              }}
              onMouseLeave={() => setShowEmojiPicker(false)}
            >
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); onReact(emoji); setShowEmojiPicker(false); }}
                  style={{
                    fontSize: 20, padding: '4px', borderRadius: 6,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    transition: 'transform var(--transition-fast)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.3)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
