import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────
interface MapToken {
  id: string;
  name: string;
  type: 'player' | 'npc' | 'object';
  col: number;  // grid column
  row: number;  // grid row
  character_id?: string;
  npc_id?: string;
  color: string;
  emoji: string;
  hp: number;
  max_hp: number;
  ac: number;
  conditions: string[];
  visible_to_players: boolean;
  is_hidden: boolean;  // DM-only hidden (invisible to players)
  initiative?: number;
  str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number;
  speed?: number;
}

interface BattleMapData {
  id: string;
  campaign_id: string;
  name: string;
  image_url: string;
  grid_cols: number;
  grid_rows: number;
  grid_size: number;
  tokens: MapToken[];
  active: boolean;
}

interface PlayerChar {
  id: string;
  name: string;
  class_name: string;
  level: number;
  current_hp: number;
  max_hp: number;
  armor_class: number;
  active_conditions: string[];
  strength: number; dexterity: number; constitution: number;
  intelligence: number; wisdom: number; charisma: number;
  speed: number;
}

interface BattleMapProps {
  campaignId: string;
  isDM: boolean;
  userId: string;
  playerCharacters?: PlayerChar[];  // live player data from parent
  onConditionApplied?: (characterId: string, conditions: string[]) => void;
}

const ALL_CONDITIONS = [
  'Blinded','Charmed','Deafened','Exhaustion','Frightened',
  'Grappled','Incapacitated','Invisible','Paralyzed','Petrified',
  'Poisoned','Prone','Restrained','Stunned','Unconscious',
];

const CONDITION_COLORS: Record<string, string> = {
  Blinded:'#94a3b8', Charmed:'#f472b6', Deafened:'#78716c', Exhaustion:'#a78bfa',
  Frightened:'#fb923c', Grappled:'#84cc16', Incapacitated:'#f87171', Invisible:'#60a5fa',
  Paralyzed:'#e879f9', Petrified:'#6b7280', Poisoned:'#4ade80', Prone:'#fbbf24',
  Restrained:'#f97316', Stunned:'#c084fc', Unconscious:'#ef4444',
};

const TOKEN_EMOJIS = ['⚔️','🛡️','🏹','🧙','🧝','🧟','👹','👺','🐉','🐺','🐗','💀','👻','🔥','❄️','⚡','🌊','🌿','🗡️','🪄'];
const TOKEN_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899','#14b8a6','#f59e0b'];

function mod(base: number, stat: number) { return Math.floor((stat - 10) / 2); }

// ── Token Dot ─────────────────────────────────────────────────────
function TokenDot({ token, isSelected, isDragging, onClick, onDragStart, isDM }: {
  token: MapToken; isSelected: boolean; isDragging: boolean;
  onClick: () => void; onDragStart: (e: React.DragEvent) => void; isDM: boolean;
}) {
  const hpPct = token.max_hp > 0 ? token.hp / token.max_hp : 1;
  const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
  const showHp = isDM || token.visible_to_players;

  return (
    <div
      draggable={isDM}
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        position: 'absolute', inset: 3,
        borderRadius: '50%',
        background: token.is_hidden && !isDM ? 'transparent' : token.color + 'cc',
        border: `2px solid ${isSelected ? '#fff' : token.color}`,
        boxShadow: isSelected ? `0 0 0 2px #fff, 0 0 0 4px ${token.color}` : '0 2px 6px rgba(0,0,0,0.5)',
        cursor: isDM ? 'grab' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: (token.is_hidden && !isDM) ? 0 : isDragging ? 0.4 : 1,
        transition: 'box-shadow 0.15s, opacity 0.15s',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1, pointerEvents: 'none' }}>{token.emoji}</span>
      {token.conditions.length > 0 && (
        <div style={{ position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#f97316', border: '1px solid rgba(0,0,0,0.3)' }} />
      )}
      {showHp && token.max_hp > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpColor, transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  );
}

// ── Token Inspector Panel ──────────────────────────────────────────
function TokenInspector({ token, isDM, onApplyCondition, onRemoveCondition, onUpdateHP, onDelete, onToggleHidden, onClose }: {
  token: MapToken; isDM: boolean;
  onApplyCondition: (c: string) => void;
  onRemoveCondition: (c: string) => void;
  onUpdateHP: (delta: number, mode: 'damage'|'heal'|'set') => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onClose: () => void;
}) {
  const [hpInput, setHpInput] = useState('');
  const [mode, setMode] = useState<'damage'|'heal'|'set'>('damage');
  const hpPct = token.max_hp > 0 ? token.hp / token.max_hp : 1;
  const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';

  const stats = token.str ? [
    { label: 'STR', val: token.str }, { label: 'DEX', val: token.dex! },
    { label: 'CON', val: token.con! }, { label: 'INT', val: token.int! },
    { label: 'WIS', val: token.wis! }, { label: 'CHA', val: token.cha! },
  ] : [];

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, width: 240, zIndex: 20,
      background: 'linear-gradient(160deg, var(--c-surface) 0%, var(--color-obsidian,#0d1117) 100%)',
      border: '1px solid var(--c-gold-bdr)', borderRadius: 12,
      boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>{token.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{token.name}</div>
          <div style={{ fontSize: 10, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {token.type === 'player' ? 'Player' : token.type === 'npc' ? 'NPC' : 'Object'}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
        {/* HP bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>HP</span>
            <span style={{ fontWeight: 900, fontSize: 16, color: hpColor }}>{token.hp}<span style={{ fontSize: 11, color: 'var(--t-2)', fontWeight: 400 }}>/{token.max_hp}</span></span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0,Math.min(100,hpPct*100))}%`, background: hpColor, transition: 'width 0.3s, background 0.3s' }} />
          </div>
        </div>

        {/* AC + Speed */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AC</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#60a5fa' }}>{token.ac || '—'}</div>
          </div>
          {token.speed && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Speed</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--c-gold-l)' }}>{token.speed}</div>
            </div>
          )}
        </div>

        {/* Ability scores */}
        {stats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {stats.map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{mod(0, s.val!) >= 0 ? '+' : ''}{mod(0, s.val!)}</div>
                <div style={{ fontSize: 9, color: 'var(--t-3)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Active conditions */}
        {token.conditions.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Conditions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {token.conditions.map(c => (
                <span key={c} onClick={isDM ? () => onRemoveCondition(c) : undefined} style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: (CONDITION_COLORS[c] ?? '#6b7280') + '25',
                  border: `1px solid ${(CONDITION_COLORS[c] ?? '#6b7280')}60`,
                  color: CONDITION_COLORS[c] ?? '#9ca3af',
                  cursor: isDM ? 'pointer' : 'default',
                }}>
                  {c} {isDM && '✕'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* DM Controls */}
        {isDM && (
          <>
            {/* HP controls */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Adjust HP</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                {(['damage','heal','set'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    flex: 1, fontSize: 10, fontWeight: 700, padding: '3px 4px', borderRadius: 5, cursor: 'pointer',
                    border: mode === m ? `1px solid ${m === 'damage' ? '#ef4444' : m === 'heal' ? '#22c55e' : '#60a5fa'}` : '1px solid var(--c-border)',
                    background: mode === m ? (m === 'damage' ? 'rgba(239,68,68,0.15)' : m === 'heal' ? 'rgba(34,197,94,0.15)' : 'rgba(96,165,250,0.15)') : 'transparent',
                    color: mode === m ? (m === 'damage' ? '#ef4444' : m === 'heal' ? '#22c55e' : '#60a5fa') : 'var(--t-2)',
                  }}>{m}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number" value={hpInput} onChange={e => setHpInput(e.target.value)}
                  placeholder="Amount"
                  style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && hpInput) { onUpdateHP(parseInt(hpInput), mode); setHpInput(''); }
                  }}
                />
                <button
                  onClick={() => { if (hpInput) { onUpdateHP(parseInt(hpInput), mode); setHpInput(''); } }}
                  style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                    border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}
                >Apply</button>
              </div>
            </div>

            {/* Add condition */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Apply Condition</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {ALL_CONDITIONS.filter(c => !token.conditions.includes(c)).map(c => (
                  <button key={c} onClick={() => onApplyCondition(c)} style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99, cursor: 'pointer',
                    border: `1px solid ${(CONDITION_COLORS[c] ?? '#6b7280')}50`,
                    background: (CONDITION_COLORS[c] ?? '#6b7280') + '15',
                    color: CONDITION_COLORS[c] ?? '#9ca3af',
                  }}>{c}</button>
                ))}
              </div>
            </div>

            {/* Token visibility + delete */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onToggleHidden} style={{
                flex: 1, fontSize: 10, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--c-border)', background: token.is_hidden ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: token.is_hidden ? 'var(--t-1)' : 'var(--t-2)',
              }}>{token.is_hidden ? '👁 Show' : '🙈 Hide'}</button>
              <button onClick={onDelete} style={{
                flex: 1, fontSize: 10, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              }}>Remove</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Add Token Dialog ───────────────────────────────────────────────
function AddTokenDialog({ playerChars, onAdd, onClose }: {
  playerChars: PlayerChar[];
  onAdd: (token: Omit<MapToken, 'col' | 'row'>) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<'player'|'npc'>('npc');
  const [name, setName] = useState('');
  const [selectedChar, setSelectedChar] = useState<string>('');
  const [hp, setHp] = useState('10');
  const [maxHp, setMaxHp] = useState('10');
  const [ac, setAc] = useState('12');
  const [emoji, setEmoji] = useState('👹');
  const [color, setColor] = useState(TOKEN_COLORS[0]);
  const [str, setStr] = useState('10'); const [dex, setDex] = useState('10');
  const [con, setCon] = useState('10'); const [int_, setInt] = useState('10');
  const [wis, setWis] = useState('10'); const [cha, setCha] = useState('10');

  function submit() {
    if (type === 'player' && selectedChar) {
      const pc = playerChars.find(p => p.id === selectedChar);
      if (!pc) return;
      onAdd({
        id: crypto.randomUUID(), name: pc.name, type: 'player',
        character_id: pc.id, color, emoji: '🧝',
        hp: pc.current_hp, max_hp: pc.max_hp, ac: pc.armor_class,
        conditions: pc.active_conditions ?? [],
        str: pc.strength, dex: pc.dexterity, con: pc.constitution,
        int: pc.intelligence, wis: pc.wisdom, cha: pc.charisma,
        speed: pc.speed, visible_to_players: true, is_hidden: false,
      });
    } else {
      if (!name.trim()) return;
      onAdd({
        id: crypto.randomUUID(), name: name.trim(), type: 'npc',
        color, emoji, hp: parseInt(hp)||10, max_hp: parseInt(maxHp)||10,
        ac: parseInt(ac)||12, conditions: [],
        str: parseInt(str)||10, dex: parseInt(dex)||10, con: parseInt(con)||10,
        int: parseInt(int_)||10, wis: parseInt(wis)||10, cha: parseInt(cha)||10,
        speed: 30, visible_to_players: true, is_hidden: false,
      });
    }
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 14, width: '100%', maxWidth: 460, padding: 20, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--c-gold-l)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Add Token</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['player','npc'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, fontWeight: 700, fontSize: 12, padding: '7px', borderRadius: 7, cursor: 'pointer',
              border: type === t ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
              background: type === t ? 'var(--c-gold-bg)' : 'transparent',
              color: type === t ? 'var(--c-gold-l)' : 'var(--t-2)',
            }}>{t === 'player' ? '🧝 Player Character' : '👹 NPC / Monster'}</button>
          ))}
        </div>

        {type === 'player' ? (
          <div>
            <label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 4 }}>Select Player</label>
            <select value={selectedChar} onChange={e => setSelectedChar(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 7, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-1)' }}>
              <option value="">Choose character...</option>
              {playerChars.map(pc => (
                <option key={pc.id} value={pc.id}>{pc.name} — {pc.class_name} {pc.level}</option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 4 }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Goblin 1" style={{ width: '100%', fontSize: 13 }} autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 3 }}>HP</label>
                <input type="number" value={hp} onChange={e => { setHp(e.target.value); setMaxHp(e.target.value); }} style={{ width: '100%', fontSize: 13 }} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 3 }}>Max HP</label>
                <input type="number" value={maxHp} onChange={e => setMaxHp(e.target.value)} style={{ width: '100%', fontSize: 13 }} /></div>
              <div><label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 3 }}>AC</label>
                <input type="number" value={ac} onChange={e => setAc(e.target.value)} style={{ width: '100%', fontSize: 13 }} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5 }}>
              {[['STR',str,setStr],['DEX',dex,setDex],['CON',con,setCon],['INT',int_,setInt],['WIS',wis,setWis],['CHA',cha,setCha]].map(([label, val, setter]) => (
                <div key={label as string}><label style={{ fontSize: 9, color: 'var(--t-3)', display: 'block', marginBottom: 2 }}>{label as string}</label>
                  <input type="number" value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)} style={{ width: '100%', fontSize: 11, padding: '3px 4px' }} /></div>
              ))}
            </div>
            {/* Emoji picker */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 4 }}>Icon</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {TOKEN_EMOJIS.map(e => (
                  <button key={e} onClick={() => setEmoji(e)} style={{
                    width: 34, height: 34, fontSize: 18, borderRadius: 7, cursor: 'pointer',
                    border: emoji === e ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                    background: emoji === e ? 'var(--c-gold-bg)' : 'transparent',
                  }}>{e}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Color */}
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--t-3)', display: 'block', marginBottom: 4 }}>Token Color</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {TOKEN_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                border: color === c ? '3px solid #fff' : '2px solid transparent',
              }} />
            ))}
          </div>
        </div>

        <button onClick={submit} className="btn-gold" style={{ width: '100%', marginTop: 16, fontWeight: 700 }}>
          Add to Map
        </button>
      </div>
    </div>
  );
}

// ── Main BattleMap Component ───────────────────────────────────────
export default function BattleMap({ campaignId, isDM, userId, playerCharacters = [], onConditionApplied }: BattleMapProps) {
  const [maps, setMaps] = useState<BattleMapData[]>([]);
  const [activeMap, setActiveMap] = useState<BattleMapData | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [showAddToken, setShowAddToken] = useState(false);
  const [showNewMapForm, setShowNewMapForm] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapCols, setNewMapCols] = useState('20');
  const [newMapRows, setNewMapRows] = useState('15');
  const [saving, setSaving] = useState(false);
  const dropTarget = useRef<{ col: number; row: number } | null>(null);

  // Load maps on mount
  useEffect(() => {
    loadMaps();
    const channel = supabase.channel(`battle_maps:${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_maps', filter: `campaign_id=eq.${campaignId}` }, payload => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const updated = payload.new as BattleMapData;
          setMaps(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
          setActiveMap(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
        } else if (payload.eventType === 'DELETE') {
          setMaps(prev => prev.filter(m => m.id !== payload.old.id));
          setActiveMap(prev => prev?.id === payload.old.id ? null : prev);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadMaps() {
    const { data } = await supabase.from('battle_maps').select('*').eq('campaign_id', campaignId).order('created_at');
    if (data) {
      setMaps(data);
      const active = data.find(m => m.active) ?? data[0] ?? null;
      setActiveMap(active);
    }
  }

  async function saveTokens(tokens: MapToken[]) {
    if (!activeMap) return;
    setSaving(true);
    await supabase.from('battle_maps').update({ tokens }).eq('id', activeMap.id);
    setSaving(false);
  }

  async function createMap() {
    if (!newMapName.trim()) return;
    const { data } = await supabase.from('battle_maps').insert({
      campaign_id: campaignId,
      name: newMapName.trim(),
      image_url: '',
      grid_cols: parseInt(newMapCols) || 20,
      grid_rows: parseInt(newMapRows) || 15,
      grid_size: 48,
      tokens: [],
      active: maps.length === 0,
    }).select().single();
    if (data) {
      setMaps(prev => [...prev, data]);
      setActiveMap(data);
      setShowNewMapForm(false);
      setNewMapName('');
    }
  }

  async function setMapActive(mapId: string) {
    await supabase.from('battle_maps').update({ active: false }).eq('campaign_id', campaignId);
    await supabase.from('battle_maps').update({ active: true }).eq('id', mapId);
    setMaps(prev => prev.map(m => ({ ...m, active: m.id === mapId })));
    const map = maps.find(m => m.id === mapId);
    if (map) setActiveMap({ ...map, active: true });
  }

  function updateToken(tokenId: string, updates: Partial<MapToken>) {
    if (!activeMap) return;
    const tokens = activeMap.tokens.map(t => t.id === tokenId ? { ...t, ...updates } : t);
    const updated = { ...activeMap, tokens };
    setActiveMap(updated);
    saveTokens(tokens);
    // Auto-sync conditions to character if player token
    const token = tokens.find(t => t.id === tokenId);
    if (token?.character_id && updates.conditions !== undefined && onConditionApplied) {
      onConditionApplied(token.character_id, updates.conditions);
      // Also update Supabase character directly
      supabase.from('characters').update({ active_conditions: updates.conditions }).eq('id', token.character_id);
    }
    // Auto-sync HP to character if player token
    if (token?.character_id && updates.hp !== undefined) {
      supabase.from('characters').update({ current_hp: updates.hp }).eq('id', token.character_id);
    }
  }

  function removeToken(tokenId: string) {
    if (!activeMap) return;
    const tokens = activeMap.tokens.filter(t => t.id !== tokenId);
    setActiveMap({ ...activeMap, tokens });
    saveTokens(tokens);
    setSelectedTokenId(null);
  }

  function addToken(token: Omit<MapToken, 'col'|'row'>) {
    if (!activeMap) return;
    // Place at first empty cell
    const occupied = new Set(activeMap.tokens.map(t => `${t.col},${t.row}`));
    let col = 1, row = 1;
    outer: for (let r = 1; r <= activeMap.grid_rows; r++) {
      for (let c = 1; c <= activeMap.grid_cols; c++) {
        if (!occupied.has(`${c},${r}`)) { col = c; row = r; break outer; }
      }
    }
    const full: MapToken = { ...token, col, row };
    const tokens = [...activeMap.tokens, full];
    setActiveMap({ ...activeMap, tokens });
    saveTokens(tokens);
  }

  // Sync player token HP/conditions from live character data
  useEffect(() => {
    if (!activeMap || !playerCharacters.length) return;
    let changed = false;
    const tokens = activeMap.tokens.map(t => {
      if (t.type !== 'player' || !t.character_id) return t;
      const pc = playerCharacters.find(p => p.id === t.character_id);
      if (!pc) return t;
      const updates: Partial<MapToken> = {};
      if (t.hp !== pc.current_hp) { updates.hp = pc.current_hp; changed = true; }
      if (JSON.stringify(t.conditions) !== JSON.stringify(pc.active_conditions ?? [])) {
        updates.conditions = pc.active_conditions ?? []; changed = true;
      }
      return Object.keys(updates).length ? { ...t, ...updates } : t;
    });
    if (changed) setActiveMap(prev => prev ? { ...prev, tokens } : prev);
  }, [playerCharacters]);

  // ── Drag handlers ──
  function handleDragStart(e: React.DragEvent, tokenId: string) {
    e.dataTransfer.setData('tokenId', tokenId);
    setDraggingTokenId(tokenId);
  }

  function handleCellDrop(e: React.DragEvent, col: number, row: number) {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData('tokenId');
    if (!tokenId || !activeMap) return;
    // Check if cell is occupied
    const occupied = activeMap.tokens.find(t => t.col === col && t.row === row && t.id !== tokenId);
    if (occupied) return;
    updateToken(tokenId, { col, row });
    setDraggingTokenId(null);
  }

  const selectedToken = activeMap?.tokens.find(t => t.id === selectedTokenId) ?? null;
  const visibleTokens = activeMap?.tokens.filter(t => isDM || !t.is_hidden) ?? [];
  const gridSize = activeMap?.grid_size ?? 48;

  if (!activeMap && !isDM) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--t-3)', fontSize: 14 }}>
        No active battle map. Waiting for DM to set one up...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Map selector */}
        {maps.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {maps.map(m => (
              <button key={m.id} onClick={() => setMapActive(m.id)} style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: activeMap?.id === m.id ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                background: activeMap?.id === m.id ? 'var(--c-gold-bg)' : 'transparent',
                color: activeMap?.id === m.id ? 'var(--c-gold-l)' : 'var(--t-2)',
              }}>{m.name}</button>
            ))}
          </div>
        )}
        {isDM && (
          <>
            <button onClick={() => setShowAddToken(true)} className="btn-gold btn-sm" disabled={!activeMap}>
              + Add Token
            </button>
            <button onClick={() => setShowNewMapForm(v => !v)} className="btn-secondary btn-sm">
              {showNewMapForm ? 'Cancel' : '+ New Map'}
            </button>
            {saving && <span style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>Saving…</span>}
          </>
        )}
        {activeMap && (
          <span style={{ fontSize: 11, color: 'var(--t-3)', marginLeft: 'auto' }}>
            {activeMap.grid_cols}×{activeMap.grid_rows} grid · {visibleTokens.length} token{visibleTokens.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* New map form */}
      {showNewMapForm && isDM && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--c-raised)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          <input value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="Map name (e.g. Goblin Cave)" style={{ flex: 1, fontSize: 13 }} onKeyDown={e => e.key === 'Enter' && createMap()} autoFocus />
          <input type="number" value={newMapCols} onChange={e => setNewMapCols(e.target.value)} style={{ width: 52, fontSize: 12 }} placeholder="Cols" />
          <span style={{ fontSize: 11, color: 'var(--t-3)' }}>×</span>
          <input type="number" value={newMapRows} onChange={e => setNewMapRows(e.target.value)} style={{ width: 52, fontSize: 12 }} placeholder="Rows" />
          <span style={{ fontSize: 11, color: 'var(--t-3)' }}>grid</span>
          <button onClick={createMap} className="btn-gold btn-sm">Create</button>
        </div>
      )}

      {/* Map grid */}
      {activeMap ? (
        <div style={{ position: 'relative', width: '100%' }}>
          {/* Scrollable grid wrapper */}
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh', border: '1px solid var(--c-border)', borderRadius: 10, background: '#0d1117' }}>
            <div style={{
              position: 'relative',
              width: activeMap.grid_cols * gridSize,
              height: activeMap.grid_rows * gridSize,
              backgroundImage: activeMap.image_url ? `url(${activeMap.image_url})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}>
              {/* Grid lines */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {Array.from({ length: activeMap.grid_cols + 1 }, (_, i) => (
                  <line key={`v${i}`} x1={i * gridSize} y1={0} x2={i * gridSize} y2={activeMap.grid_rows * gridSize}
                    stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                ))}
                {Array.from({ length: activeMap.grid_rows + 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * gridSize} x2={activeMap.grid_cols * gridSize} y2={i * gridSize}
                    stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                ))}
              </svg>

              {/* Drop cells — only render when dragging */}
              {draggingTokenId && Array.from({ length: activeMap.grid_rows }, (_, row) =>
                Array.from({ length: activeMap.grid_cols }, (_, col) => (
                  <div key={`cell-${col}-${row}`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleCellDrop(e, col + 1, row + 1)}
                    style={{
                      position: 'absolute',
                      left: col * gridSize, top: row * gridSize,
                      width: gridSize, height: gridSize,
                    }}
                  />
                ))
              )}

              {/* Tokens */}
              {visibleTokens.map(token => (
                <div
                  key={token.id}
                  style={{
                    position: 'absolute',
                    left: (token.col - 1) * gridSize,
                    top: (token.row - 1) * gridSize,
                    width: gridSize, height: gridSize,
                    zIndex: selectedTokenId === token.id ? 10 : 5,
                    transition: draggingTokenId === token.id ? 'none' : 'left 0.2s, top 0.2s',
                  }}
                >
                  <TokenDot
                    token={token}
                    isSelected={selectedTokenId === token.id}
                    isDragging={draggingTokenId === token.id}
                    isDM={isDM}
                    onClick={() => setSelectedTokenId(prev => prev === token.id ? null : token.id)}
                    onDragStart={e => handleDragStart(e, token.id)}
                  />
                  {/* Token name label */}
                  <div style={{
                    position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 9, fontWeight: 700, color: 'var(--t-1)',
                    whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                  }}>{token.name.split(' ')[0]}</div>
                </div>
              ))}

              {/* Selected token target indicator */}
              {selectedToken && (
                <div style={{
                  position: 'absolute',
                  left: (selectedToken.col - 1) * gridSize - 3,
                  top: (selectedToken.row - 1) * gridSize - 3,
                  width: gridSize + 6, height: gridSize + 6,
                  borderRadius: '50%', border: '2px dashed #fff',
                  pointerEvents: 'none', zIndex: 11,
                  animation: 'spin 4s linear infinite',
                }} />
              )}
            </div>
          </div>

          {/* Token inspector */}
          {selectedToken && (
            <div style={{ position: 'absolute', top: 0, right: -250, zIndex: 30 }}>
              <TokenInspector
                token={selectedToken}
                isDM={isDM}
                onApplyCondition={c => {
                  const newConds = [...selectedToken.conditions.filter(x => x !== c), c];
                  updateToken(selectedToken.id, { conditions: newConds });
                }}
                onRemoveCondition={c => {
                  updateToken(selectedToken.id, { conditions: selectedToken.conditions.filter(x => x !== c) });
                }}
                onUpdateHP={(delta, mode) => {
                  let newHp = selectedToken.hp;
                  if (mode === 'damage') newHp = Math.max(0, selectedToken.hp - delta);
                  else if (mode === 'heal') newHp = Math.min(selectedToken.max_hp, selectedToken.hp + delta);
                  else newHp = Math.max(0, Math.min(selectedToken.max_hp, delta));
                  updateToken(selectedToken.id, { hp: newHp });
                  // Auto-apply unconscious at 0 hp
                  if (newHp === 0 && !selectedToken.conditions.includes('Unconscious')) {
                    const newConds = [...selectedToken.conditions, 'Unconscious'];
                    updateToken(selectedToken.id, { hp: newHp, conditions: newConds });
                  }
                }}
                onDelete={() => removeToken(selectedToken.id)}
                onToggleHidden={() => updateToken(selectedToken.id, { is_hidden: !selectedToken.is_hidden })}
                onClose={() => setSelectedTokenId(null)}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--t-3)', fontSize: 14, border: '1px dashed var(--c-border)', borderRadius: 10 }}>
          {isDM ? 'Create a new map to get started.' : 'No active map. Waiting for DM…'}
        </div>
      )}

      {/* Legend */}
      {activeMap && (
        <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--t-3)', flexWrap: 'wrap' }}>
          <span>🟢 Full HP</span>
          <span>🟡 Bloodied (&lt;50%)</span>
          <span>🔴 Critical (&lt;25%)</span>
          <span>🟠 dot = has conditions</span>
          {isDM && <span>· Drag tokens to move · Click to inspect · Right-click to select</span>}
          {!isDM && <span>· Click a token to inspect and target</span>}
        </div>
      )}

      {/* Modals */}
      {showAddToken && (
        <AddTokenDialog
          playerChars={playerCharacters}
          onAdd={addToken}
          onClose={() => setShowAddToken(false)}
        />
      )}

      {/* CSS for spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
