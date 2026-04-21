import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import CombatEventLog from '../shared/CombatEventLog';
import type { Campaign, SessionState } from '../../types';
import { CONDITIONS, CONDITION_MAP } from '../../data/conditions';
import { abilityModifier, proficiencyBonus } from '../../lib/gameUtils';

interface PartyMember {
  id: string;
  name: string;
  class_name: string;
  level: number;
  current_hp: number;
  max_hp: number;
  temp_hp: number;
  armor_class: number;
  speed: number;
  initiative_bonus: number;
  active_conditions: string[];
  concentration_spell: string;
  concentration_rounds_remaining: number | null;
  avatar_url: string | null;
  inspiration: boolean;
  spell_slots: any;
  wisdom: number;
  skill_proficiencies: string[];
  skill_expertises: string[];
  death_saves_successes: number;
  death_saves_failures: number;
}

interface NPC {
  id: string;
  name: string;
  role: string;
  race: string;
  description: string;
  notes: string;
  hp: number | null;
  max_hp: number | null;
  ac: number | null;
  initiative: number | null;
  conditions: string[];
  visible_to_players: boolean;
  in_combat: boolean;
  is_alive: boolean;
  faction: string;
  location: string;
}

interface DMScreenProps {
  campaign: Campaign;
  sessionState: SessionState | null;
  onUpdateSession: (updates: Partial<SessionState>) => void;
}

const ROLE_COLORS: Record<string, string> = {
  ally: '#34d399', enemy: '#f87171', neutral: '#94a3b8',
  merchant: '#fbbf24', 'quest-giver': '#a78bfa', boss: '#ef4444', unknown: '#64748b',
};

function hpColor(cur: number, max: number) {
  const p = max > 0 ? cur / max : 0;
  return p > 0.6 ? 'var(--hp-full)' : p > 0.25 ? 'var(--hp-mid)' : p > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';
}

function passivePerc(m: PartyMember) {
  const pb = proficiencyBonus(m.level);
  const mod = abilityModifier(m.wisdom);
  const hasProf = (m.skill_proficiencies ?? []).includes('Perception');
  const hasExp = (m.skill_expertises ?? []).includes('Perception');
  return 10 + mod + (hasExp ? pb * 2 : hasProf ? pb : 0);
}

export default function DMScreen({ campaign, sessionState, onUpdateSession }: DMScreenProps) {
  const [party, setParty] = useState<PartyMember[]>([]);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [notes, setNotes] = useState((campaign as any).notes ?? '');
  const [section, setSection] = useState<'party' | 'npcs' | 'combat' | 'log' | 'notes'>('party');
  const [editingNPC, setEditingNPC] = useState<Partial<NPC> | null>(null);
  const [expandedNPC, setExpandedNPC] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [hpDeltas, setHpDeltas] = useState<Record<string, string>>({});
  const [percDC, setPercDC] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const combatants = sessionState?.initiative_order ?? [];
  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);
  const currentTurn = sessionState?.current_turn ?? 0;
  const round = sessionState?.round ?? 1;
  const combatActive = sessionState?.combat_active ?? false;
  const activeId = sorted[currentTurn % Math.max(sorted.length, 1)]?.id;

  useEffect(() => {
    loadParty();
    loadNPCs();
    const ch = supabase.channel(`dm-screen-${campaign.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `campaign_id=eq.${campaign.id}` }, () => loadParty())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaign.id]);

  async function loadParty() {
    const { data } = await supabase.from('characters')
      .select('id,name,class_name,level,current_hp,max_hp,temp_hp,armor_class,speed,initiative_bonus,active_conditions,concentration_spell,concentration_rounds_remaining,avatar_url,inspiration,spell_slots,wisdom,skill_proficiencies,skill_expertises,death_saves_successes,death_saves_failures')
      .eq('campaign_id', campaign.id).order('name');
    if (data) setParty(data as PartyMember[]);
  }

  async function loadNPCs() {
    const { data } = await supabase.from('npcs').select('*').eq('campaign_id', campaign.id).order('name');
    if (data) setNpcs(data as NPC[]);
  }

  async function updateNPC(id: string, patch: Partial<NPC>) {
    await supabase.from('npcs').update(patch).eq('id', id);
    setNpcs(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }

  async function updatePlayer(id: string, patch: Partial<PartyMember>) {
    await supabase.from('characters').update(patch).eq('id', id);
  }

  async function applyHPDelta(m: PartyMember, type: 'damage' | 'heal') {
    const v = parseInt(hpDeltas[m.id] ?? '');
    if (isNaN(v) || v <= 0) return;
    const delta = type === 'damage' ? -v : v;
    const newHP = Math.max(0, Math.min(m.max_hp, m.current_hp + delta));
    await updatePlayer(m.id, { current_hp: newHP });
    setHpDeltas(prev => ({ ...prev, [m.id]: '' }));
  }

  async function toggleConditionPlayer(m: PartyMember, cond: string) {
    const current = m.active_conditions ?? [];
    const next = current.includes(cond) ? current.filter(c => c !== cond) : [...current, cond];
    await updatePlayer(m.id, { active_conditions: next } as any);
    setParty(prev => prev.map(p => p.id === m.id ? { ...p, active_conditions: next } : p));
  }

  // v2.42.0: When a new combat round starts, tick down every party member's
  // concentration timer by one round (= 6 seconds). Any character whose timer
  // hits 0 has their concentration auto-dropped and gets surfaced in a toast.
  const [roundTickToast, setRoundTickToast] = useState<string | null>(null);

  async function tickConcentrationTimers() {
    const decremented: string[] = [];
    const expired: string[] = [];
    const updates: Promise<unknown>[] = [];

    party.forEach(p => {
      const rounds = p.concentration_rounds_remaining;
      if (rounds === null || rounds === undefined || !p.concentration_spell) return;
      const next = rounds - 1;
      if (next <= 0) {
        // Auto-drop concentration
        expired.push(p.name);
        updates.push(updatePlayer(p.id, {
          concentration_spell: '',
          concentration_rounds_remaining: null,
        } as any));
      } else {
        decremented.push(p.name);
        updates.push(updatePlayer(p.id, {
          concentration_rounds_remaining: next,
        } as any));
      }
    });

    if (updates.length === 0) return;
    await Promise.all(updates);

    // Optimistic local state update
    setParty(prev => prev.map(p => {
      const rounds = p.concentration_rounds_remaining;
      if (rounds === null || rounds === undefined || !p.concentration_spell) return p;
      const next = rounds - 1;
      if (next <= 0) return { ...p, concentration_spell: '', concentration_rounds_remaining: null };
      return { ...p, concentration_rounds_remaining: next };
    }));

    // Toast — prioritize expirations, otherwise summarize the decrement
    if (expired.length > 0) {
      setRoundTickToast(`${expired.join(', ')} ${expired.length === 1 ? 'has' : 'have'} lost concentration (timer expired)`);
      setTimeout(() => setRoundTickToast(null), 5000);
    } else if (decremented.length > 0) {
      setRoundTickToast(`Ticked ${decremented.length} concentration timer${decremented.length === 1 ? '' : 's'}`);
      setTimeout(() => setRoundTickToast(null), 2500);
    }
  }

  function nextTurn() {
    if (!sorted.length) return;
    const next = (currentTurn + 1) % sorted.length;
    const isNewRound = next === 0;
    onUpdateSession({ current_turn: next, round: isNewRound ? round + 1 : round });
    // Only tick concentration when a NEW round starts (not on every individual turn)
    if (isNewRound) {
      tickConcentrationTimers();
    }
  }

  function prevTurn() {
    if (!sorted.length) return;
    const prev = (currentTurn - 1 + sorted.length) % sorted.length;
    onUpdateSession({ current_turn: prev });
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from('campaigns').update({ notes }).eq('id', campaign.id);
    setSavingNotes(false);
  }

  const SECTIONS = [
    { id: 'party', label: 'Party' },
    { id: 'npcs',  label: 'NPCs' },
    { id: 'combat',label: 'Combat' },
    { id: 'log',   label: 'Log' },
    { id: 'notes', label: 'Notes' },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, position: 'relative' }}>

      {/* v2.42.0: Concentration tick toast — appears top-right when round advances and timers tick */}
      {roundTickToast && (
        <div style={{
          position: 'fixed', top: 70, right: 20, zIndex: 1000,
          padding: '10px 16px', borderRadius: 'var(--r-md)',
          background: roundTickToast.includes('lost concentration') ? 'rgba(239,68,68,0.18)' : 'rgba(167,139,250,0.18)',
          border: `1px solid ${roundTickToast.includes('lost concentration') ? 'rgba(239,68,68,0.5)' : 'rgba(167,139,250,0.5)'}`,
          color: roundTickToast.includes('lost concentration') ? '#fca5a5' : '#c4b5fd',
          fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 600,
          maxWidth: 420,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          animation: 'pulse-gold 0.4s ease-out',
        }}>
          {roundTickToast.includes('lost concentration') ? '⚠ ' : '⏱ '}{roundTickToast}
        </div>
      )}

      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        padding: '10px 16px',
        background: 'linear-gradient(135deg, rgba(155,28,28,0.12), rgba(155,28,28,0.06))',
        border: '1px solid rgba(155,28,28,0.35)',
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', boxShadow: '0 0 8px #f87171' }} />
          <span style={{ fontWeight: 800, fontSize: 13, color: '#fca5a5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            DM Screen — {campaign.name}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', padding: '2px 8px', borderRadius: 999 }}>
            {party.length} players · {npcs.filter(n => n.is_alive).length} NPCs
          </span>
        </div>
        {combatActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-red-l)', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', padding: '2px 10px', borderRadius: 999 }}>
              Round {round}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-gold-l)' }}>
              ▶ {sorted[currentTurn % Math.max(sorted.length, 1)]?.name ?? '—'}
            </span>
            <button onClick={prevTurn} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-2)' }}>◀</button>
            <button onClick={nextTurn} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}>Next ▶</button>
          </div>
        )}
      </div>

      {/* ── Section tabs ── */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--c-border)', paddingBottom: 0 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            fontWeight: 700, fontSize: 12, padding: '7px 14px', background: 'transparent', border: 'none',
            borderBottom: section === s.id ? '2px solid var(--c-gold)' : '2px solid transparent',
            color: section === s.id ? 'var(--c-gold-l)' : 'var(--t-2)', cursor: 'pointer', marginBottom: -1,
            transition: 'color 0.15s',
          }}>
            {s.label}
            {s.id === 'npcs' && npcs.filter(n => !n.visible_to_players && n.is_alive).length > 0 && (
              <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: 'var(--t-3)', background: 'var(--c-raised)', padding: '0 5px', borderRadius: 999 }}>
                {npcs.filter(n => !n.visible_to_players && n.is_alive).length} hidden
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ PARTY SECTION ══════════════ */}
      {section === 'party' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Passive perception DC input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Passive Perception DC</span>
            <input type="number" value={percDC} onChange={e => setPercDC(e.target.value)}
              placeholder="—" min={0} max={30}
              style={{ width: 48, fontSize: 13, fontFamily: 'var(--ff-stat)', fontWeight: 700, textAlign: 'center', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
            />
            {percDC && parseInt(percDC) > 0 && (
              <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
                {party.filter(m => passivePerc(m) >= parseInt(percDC)).length} of {party.length} notice
              </span>
            )}
          </div>

          {party.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-3)', fontSize: 13 }}>No players in this campaign yet.</div>
          ) : party.map(m => {
            const pp = passivePerc(m);
            const dc = parseInt(percDC);
            const percMet = !isNaN(dc) && dc > 0 && pp >= dc;
            const percFail = !isNaN(dc) && dc > 0 && pp < dc;
            const hpPct = m.max_hp > 0 ? m.current_hp / m.max_hp : 0;
            const col = hpColor(m.current_hp, m.max_hp);
            const isExp = expandedPlayer === m.id;
            const isDowned = m.current_hp <= 0;

            return (
              <div key={m.id} style={{ border: `1px solid ${isDowned ? 'rgba(220,38,38,0.4)' : 'var(--c-border)'}`, borderRadius: 12, background: isDowned ? 'rgba(220,38,38,0.03)' : 'var(--c-card)', overflow: 'hidden' }}>
                {/* HP accent bar */}
                <div style={{ height: 3, background: col, width: `${Math.max(1, hpPct * 100)}%`, transition: 'width 0.4s' }} />

                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Name row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--c-border)', overflow: 'hidden', flexShrink: 0, background: 'var(--c-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {m.avatar_url ? <img src={m.avatar_url} alt={m.name} width={36} height={36} style={{ objectFit: 'cover' }} /> : <span style={{ fontSize: 18, opacity: 0.4 }}></span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: isDowned ? '#f87171' : 'var(--t-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.name}
                        {m.inspiration && <span title="Inspired" style={{ fontSize: 11 }}></span>}
                        {isDowned && <span style={{ fontSize: 9, fontWeight: 800, color: '#f87171', background: 'rgba(220,38,38,0.12)', padding: '1px 5px', borderRadius: 3 }}>DOWNED</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t-3)' }}>Lv {m.level} {m.class_name}</div>
                    </div>
                    {/* Key stats */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>HP</div>
                        <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14, color: col }}>{m.current_hp}<span style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 400 }}>/{m.max_hp}</span></div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>AC</div>
                        <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14, color: 'var(--c-gold-l)' }}>{m.armor_class}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>PASS.</div>
                        <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14, color: percMet ? 'var(--c-green-l)' : percFail ? '#f87171' : 'var(--t-2)' }}>{pp}</div>
                      </div>
                      <button onClick={() => setExpandedPlayer(isExp ? null : m.id)}
                        style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: isExp ? 'var(--c-raised)' : 'transparent', color: 'var(--t-3)', transform: isExp ? 'rotate(180deg)' : 'none' }}>
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Conditions strip */}
                  {(m.active_conditions ?? []).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(m.active_conditions ?? []).map(c => {
                        const cm = CONDITION_MAP[c];
                        return <span key={c} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: `${cm?.color ?? '#64748b'}15`, border: `1px solid ${cm?.color ?? '#64748b'}40`, color: cm?.color ?? 'var(--t-2)' }}>{cm?.icon} {c}</span>;
                      })}
                    </div>
                  )}

                  {/* Concentration */}
                  {m.concentration_spell && (
                    <div style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', padding: '2px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                      Concentrating: {m.concentration_spell}
                    </div>
                  )}

                  {/* Expanded DM controls */}
                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* HP adjust */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="number" value={hpDeltas[m.id] ?? ''} onChange={e => setHpDeltas(p => ({ ...p, [m.id]: e.target.value }))}
                          placeholder="Amount" min={0}
                          style={{ width: 80, fontSize: 13, fontFamily: 'var(--ff-stat)', textAlign: 'center', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                        />
                        <button onClick={() => applyHPDelta(m, 'damage')} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#f87171' }}>Damage</button>
                        <button onClick={() => applyHPDelta(m, 'heal')} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>Heal</button>
                        <button onClick={() => updatePlayer(m.id, { current_hp: m.max_hp })} style={{ fontSize: 10, fontWeight: 600, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-3)' }}>Full HP</button>
                        <button onClick={() => updatePlayer(m.id, { inspiration: !m.inspiration })} style={{ fontSize: 10, fontWeight: 600, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: `1px solid ${m.inspiration ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`, background: m.inspiration ? 'var(--c-gold-bg)' : 'var(--c-raised)', color: m.inspiration ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
                          {m.inspiration ? 'Inspired' : 'Inspire'}
                        </button>
                      </div>
                      {/* Condition toggles */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {CONDITIONS.slice(0, 10).map(c => {
                          const active = (m.active_conditions ?? []).includes(c.name);
                          return (
                            <button key={c.name} onClick={() => toggleConditionPlayer(m, c.name)}
                              style={{ fontSize: 9, fontWeight: active ? 700 : 400, padding: '2px 7px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                                border: `1px solid ${active ? c.color : 'var(--c-border-m)'}`,
                                background: active ? `${c.color}18` : 'transparent',
                                color: active ? c.color : 'var(--t-3)' }}>
                              {c.icon} {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ NPCs SECTION ══════════════ */}
      {section === 'npcs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--t-3)' }}>
              NPCs hidden from players until you reveal them. Revealed NPCs appear on the Party tab.
            </span>
            <button onClick={() => setEditingNPC({ name: '', role: 'neutral', race: '', description: '', notes: '', faction: '', location: '', visible_to_players: false, in_combat: false, is_alive: true, conditions: [], hp: null, max_hp: null, ac: null, initiative: null })}
              style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}>
              + New NPC
            </button>
          </div>

          {/* Hidden NPCs */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              Hidden from Players
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 9 }}>— only you can see these</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {npcs.filter(n => !n.visible_to_players && n.is_alive).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--t-3)', padding: '12px 0' }}>No hidden NPCs.</div>
              )}
              {npcs.filter(n => !n.visible_to_players && n.is_alive).map(npc => (
                <NPCRow key={npc.id} npc={npc} expanded={expandedNPC === npc.id}
                  onExpand={() => setExpandedNPC(expandedNPC === npc.id ? null : npc.id)}
                  onUpdate={patch => updateNPC(npc.id, patch)}
                  onEdit={() => setEditingNPC(npc)}
                />
              ))}
            </div>
          </div>

          {/* Revealed NPCs */}
          {npcs.filter(n => n.visible_to_players && n.is_alive).length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-green-l)', marginBottom: 6 }}>
                Revealed to Players
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {npcs.filter(n => n.visible_to_players && n.is_alive).map(npc => (
                  <NPCRow key={npc.id} npc={npc} expanded={expandedNPC === npc.id}
                    onExpand={() => setExpandedNPC(expandedNPC === npc.id ? null : npc.id)}
                    onUpdate={patch => updateNPC(npc.id, patch)}
                    onEdit={() => setEditingNPC(npc)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Dead NPCs */}
          {npcs.filter(n => !n.is_alive).length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 10, fontWeight: 600, color: 'var(--t-3)', cursor: 'pointer', userSelect: 'none' }}>
                {npcs.filter(n => !n.is_alive).length} deceased NPCs
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {npcs.filter(n => !n.is_alive).map(npc => (
                  <NPCRow key={npc.id} npc={npc} expanded={expandedNPC === npc.id}
                    onExpand={() => setExpandedNPC(expandedNPC === npc.id ? null : npc.id)}
                    onUpdate={patch => updateNPC(npc.id, patch)}
                    onEdit={() => setEditingNPC(npc)}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ══════════════ COMBAT SECTION ══════════════ */}
      {section === 'combat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!combatActive || sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t-3)', fontSize: 13 }}>
              No active combat. Start combat from the Session tab.
            </div>
          ) : sorted.map((c, i) => {
            const isActive = c.id === activeId;
            const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
            const col = hpColor(c.current_hp, c.max_hp);
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 10,
                border: isActive ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                background: isActive ? 'rgba(212,160,23,0.07)' : 'var(--c-card)',
                boxShadow: isActive ? '0 0 16px rgba(212,160,23,0.12)' : 'none',
                transition: 'all 0.2s',
              }}>
                {isActive && <span style={{ fontSize: 10, color: 'var(--c-gold-l)' }}>▶</span>}
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 16, color: 'var(--c-gold-l)', minWidth: 28 }}>{c.initiative}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: isActive ? 800 : 600, fontSize: 13, color: isActive ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                    {c.name}
                    {c.is_monster && <span style={{ marginLeft: 6, fontSize: 9, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', padding: '1px 5px', borderRadius: 3 }}>Enemy</span>}
                  </div>
                  {c.max_hp > 0 && (
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 999, marginTop: 4, overflow: 'hidden', width: 120 }}>
                      <div style={{ height: '100%', width: `${Math.max(1, hpPct * 100)}%`, background: col, borderRadius: 999 }} />
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14, color: col }}>{c.current_hp}<span style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 400 }}>/{c.max_hp}</span></div>
                  <div style={{ fontSize: 9, color: 'var(--t-3)' }}>AC {c.ac}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ LOG SECTION ══════════════ */}
      {/* v2.93.0 — Phase A: unified CombatEventLog with Player/DM/NPC filters */}
      {section === 'log' && (
        <CombatEventLog campaignId={campaign.id} mode="campaign" maxHeight={520} />
      )}

      {/* ══════════════ NOTES SECTION ══════════════ */}
      {section === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--t-3)' }}>Private scratch pad — only you see this.</span>
            <button onClick={saveNotes} disabled={savingNotes}
              style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}>
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Monster stats, plot hooks, NPC motivations, secret notes…"
            rows={18}
            style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.7, fontFamily: 'var(--ff-body)', flex: 1 }}
          />
        </div>
      )}

      {/* ══════════════ NPC FORM MODAL ══════════════ */}
      {editingNPC && (
        <NPCFormModal
          npc={editingNPC}
          onChange={setEditingNPC}
          onSave={async () => {
            if (!editingNPC.name?.trim()) return;
            if ((editingNPC as NPC).id) {
              await supabase.from('npcs').update({ ...editingNPC, updated_at: new Date().toISOString() }).eq('id', (editingNPC as NPC).id);
            } else {
              await supabase.from('npcs').insert({ ...editingNPC, campaign_id: campaign.id });
            }
            await loadNPCs();
            setEditingNPC(null);
          }}
          onClose={() => setEditingNPC(null)}
        />
      )}
    </div>
  );
}

// ── NPC Row ──────────────────────────────────────────────────────────
function NPCRow({ npc, expanded, onExpand, onUpdate, onEdit }: {
  npc: NPC; expanded: boolean;
  onExpand: () => void;
  onUpdate: (p: Partial<NPC>) => void;
  onEdit: () => void;
}) {
  const roleColor = ROLE_COLORS[npc.role] ?? '#94a3b8';
  const hpPct = npc.max_hp && npc.max_hp > 0 && npc.hp != null ? npc.hp / npc.max_hp : null;
  const col = hpPct != null ? hpColor(npc.hp!, npc.max_hp!) : null;
  const [hpDelta, setHpDelta] = useState('');

  function applyDelta(type: 'damage' | 'heal') {
    const v = parseInt(hpDelta);
    if (isNaN(v) || v <= 0 || npc.hp == null || npc.max_hp == null) return;
    const delta = type === 'damage' ? -v : v;
    onUpdate({ hp: Math.max(0, Math.min(npc.max_hp, npc.hp + delta)) });
    setHpDelta('');
  }

  return (
    <div style={{
      border: `1px solid ${npc.visible_to_players ? 'rgba(52,211,153,0.3)' : `${roleColor}25`}`,
      borderRadius: 10, background: npc.is_alive ? 'var(--c-card)' : 'transparent',
      opacity: npc.is_alive ? 1 : 0.5, overflow: 'hidden',
    }}>
      {/* HP bar if tracked */}
      {col && hpPct != null && (
        <div style={{ height: 2, background: col, width: `${Math.max(1, hpPct * 100)}%` }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' }} onClick={onExpand}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: roleColor, boxShadow: `0 0 5px ${roleColor}`, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {npc.name}
            {!npc.is_alive && ' '}
            {npc.in_combat && <span style={{ fontSize: 8, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', padding: '1px 5px', borderRadius: 3 }}>IN COMBAT</span>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t-3)' }}>
            {npc.race && `${npc.race} · `}{npc.role}
            {npc.faction && ` · ${npc.faction}`}
          </div>
        </div>
        {col && <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 12, color: col }}>{npc.hp}/{npc.max_hp}</span>}
        {npc.ac && <span style={{ fontSize: 10, color: 'var(--c-gold-l)', fontFamily: 'var(--ff-stat)' }}>AC {npc.ac}</span>}
        {/* Reveal badge */}
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
          background: npc.visible_to_players ? 'rgba(52,211,153,0.12)' : 'var(--c-raised)',
          border: `1px solid ${npc.visible_to_players ? 'rgba(52,211,153,0.3)' : 'var(--c-border)'}`,
          color: npc.visible_to_players ? '#34d399' : 'var(--t-3)' }}>
          {npc.visible_to_players ? 'Revealed' : 'Hidden'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--t-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {npc.description && <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, margin: 0 }}>{npc.description}</p>}
          {npc.notes && (
            <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, borderLeft: '2px solid rgba(212,160,23,0.4)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', marginBottom: 3 }}>DM Notes (private)</div>
              <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{npc.notes}</p>
            </div>
          )}

          {/* HP tracking if set */}
          {npc.max_hp != null && npc.max_hp > 0 && npc.hp != null && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" value={hpDelta} onChange={e => setHpDelta(e.target.value)}
                placeholder="Amount" min={0}
                style={{ width: 70, fontSize: 12, textAlign: 'center', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)', fontFamily: 'var(--ff-stat)' }}
              />
              <button onClick={() => applyDelta('damage')} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#f87171' }}>Dmg</button>
              <button onClick={() => applyDelta('heal')} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34d399' }}>Heal</button>
              <button onClick={() => onUpdate({ hp: npc.max_hp! })} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-3)' }}>Full</button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onUpdate({ visible_to_players: !npc.visible_to_players })}
              style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                border: npc.visible_to_players ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(52,211,153,0.4)',
                background: npc.visible_to_players ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.1)',
                color: npc.visible_to_players ? '#f87171' : '#34d399' }}>
              {npc.visible_to_players ? 'Hide from Players' : 'Reveal to Players'}
            </button>
            <button onClick={() => onUpdate({ in_combat: !npc.in_combat })}
              style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                border: npc.in_combat ? '1px solid rgba(248,113,113,0.4)' : '1px solid var(--c-border-m)',
                background: npc.in_combat ? 'rgba(248,113,113,0.1)' : 'var(--c-raised)',
                color: npc.in_combat ? '#f87171' : 'var(--t-2)' }}>
              {npc.in_combat ? 'Remove from Combat' : 'Add to Combat'}
            </button>
            <button onClick={() => onUpdate({ is_alive: !npc.is_alive })}
              style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                border: '1px solid var(--c-border-m)', background: 'var(--c-raised)',
                color: npc.is_alive ? 'var(--t-3)' : 'var(--c-green-l)' }}>
              {npc.is_alive ? 'Mark Dead' : '+ Revive'}
            </button>
            <button onClick={onEdit}
              style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-2)' }}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NPC Form Modal ───────────────────────────────────────────────────
const ROLES = ['ally', 'enemy', 'neutral', 'merchant', 'quest-giver', 'boss', 'unknown'];
const ROLE_ICONS: Record<string, string> = { ally: '', enemy: '', neutral: '', merchant: '', 'quest-giver': '', boss: '', unknown: '' };

function NPCFormModal({ npc, onChange, onSave, onClose }: {
  npc: Partial<NPC>;
  onChange: (n: Partial<NPC>) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<NPC>) => onChange({ ...npc, ...patch });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--t-1)', marginBottom: 16 }}>{(npc as NPC).id ? 'Edit' : 'New'} NPC</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label>Name *</label><input value={npc.name ?? ''} onChange={e => set({ name: e.target.value })} autoFocus /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label>Role</label>
              <select value={npc.role ?? 'neutral'} onChange={e => set({ role: e.target.value })}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div><label>Race / Type</label><input value={npc.race ?? ''} onChange={e => set({ race: e.target.value })} placeholder="Human, Dragon, Construct…" /></div>
            <div><label>Faction</label><input value={npc.faction ?? ''} onChange={e => set({ faction: e.target.value })} placeholder="Thieves Guild…" /></div>
            <div><label>Location</label><input value={npc.location ?? ''} onChange={e => set({ location: e.target.value })} placeholder="The Rusty Flagon…" /></div>
            <div><label>Max HP</label><input type="number" value={npc.max_hp ?? ''} onChange={e => set({ max_hp: parseInt(e.target.value) || null, hp: parseInt(e.target.value) || null })} placeholder="—" /></div>
            <div><label>AC</label><input type="number" value={npc.ac ?? ''} onChange={e => set({ ac: parseInt(e.target.value) || null })} placeholder="—" /></div>
          </div>
          <div><label>Description (visible to players when revealed)</label><textarea value={npc.description ?? ''} onChange={e => set({ description: e.target.value })} rows={2} placeholder="What the party knows…" /></div>
          <div><label>DM Notes (always private)</label><textarea value={npc.notes ?? ''} onChange={e => set({ notes: e.target.value })} rows={2} placeholder="Secrets, motivations, plot hooks…" /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 13, textTransform: 'none', letterSpacing: 0, marginBottom: 0, fontWeight: 400 }}>
            <input type="checkbox" checked={npc.visible_to_players ?? false} onChange={e => set({ visible_to_players: e.target.checked })} />
            Visible to players now
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={saving || !npc.name?.trim()} onClick={async () => { setSaving(true); await onSave(); setSaving(false); }}>
            {saving ? 'Saving…' : 'Save NPC'}
          </button>
        </div>
      </div>
    </div>
  );
}
