import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import ActionLog from '../shared/ActionLog';
import type { Campaign, SessionState, Combatant } from '../../types';

interface PartyMember {
  id: string;
  name: string;
  class_name: string;
  level: number;
  current_hp: number;
  max_hp: number;
  temp_hp: number;
  armor_class: number;
  active_conditions: string[];
  avatar_url: string | null;
  inspiration: boolean;
}

interface DMScreenProps {
  campaign: Campaign;
  sessionState: SessionState | null;
  onUpdateSession: (updates: Partial<SessionState>) => void;
}

export default function DMScreen({ campaign, sessionState, onUpdateSession }: DMScreenProps) {
  const [party, setParty] = useState<PartyMember[]>([]);
  const [notes, setNotes] = useState('');
  const [activeSection, setActiveSection] = useState<'combat' | 'party' | 'log' | 'notes'>('combat');

  useEffect(() => {
    loadParty();
    const channel = supabase.channel(`dm-screen-${campaign.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `campaign_id=eq.${campaign.id}` }, () => loadParty())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaign.id]);

  async function loadParty() {
    const { data } = await supabase.from('characters')
      .select('id,name,class_name,level,current_hp,max_hp,temp_hp,armor_class,active_conditions,avatar_url,inspiration')
      .eq('campaign_id', campaign.id)
      .order('name');
    if (data) setParty(data as PartyMember[]);
  }

  const combatants: Combatant[] = sessionState?.initiative_order ?? [];
  const currentTurn = sessionState?.current_turn ?? 0;
  const round = sessionState?.round ?? 1;
  const combatActive = sessionState?.combat_active ?? false;

  function nextTurn() {
    if (!combatants.length) return;
    const nextIdx = (currentTurn + 1) % combatants.length;
    const newRound = nextIdx === 0 ? round + 1 : round;
    onUpdateSession({ current_turn: nextIdx, round: newRound });
  }

  function prevTurn() {
    if (!combatants.length) return;
    const prevIdx = (currentTurn - 1 + combatants.length) % combatants.length;
    onUpdateSession({ current_turn: prevIdx });
  }

  const SECTIONS = [
    { id: 'combat', label: '⚔ Initiative' },
    { id: 'party', label: '👥 Party' },
    { id: 'log', label: '📜 Log' },
    { id: 'notes', label: '📝 Notes' },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', height: '100%' }}>
      {/* DM Screen header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--sp-3) var(--sp-4)',
        background: 'rgba(155,28,28,0.08)', border: '1px solid rgba(155,28,28,0.3)',
        borderRadius: 'var(--r-md)',
      }}>
        <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#fca5a5' }}>
          🎲 DM Screen — {campaign.name}
        </div>
        {combatActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)' }}>
              Round {round} · {combatants[currentTurn]?.name ?? '—'}
            </span>
            <button className="btn-sm btn-secondary" onClick={prevTurn} style={{ padding: '3px 10px' }}>◀</button>
            <button className="btn-sm btn-gold" onClick={nextTurn} style={{ padding: '3px 10px' }}>Next ▶</button>
          </div>
        )}
      </div>

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--c-border)', paddingBottom: 0 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.06em',
            padding: 'var(--sp-2) var(--sp-3)', background: 'transparent', border: 'none',
            borderBottom: activeSection === s.id ? '2px solid var(--c-gold)' : '2px solid transparent',
            color: activeSection === s.id ? 'var(--c-gold-l)' : 'var(--t-2)',
            cursor: 'pointer', marginBottom: -1,
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Initiative tracker */}
      {activeSection === 'combat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {!combatActive || combatants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
              No active combat. Start combat from the Session tab to manage initiative here.
            </div>
          ) : combatants.map((c, i) => {
            const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
            const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : hpPct > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';
            const isActive = i === currentTurn;
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                padding: 'var(--sp-3) var(--sp-4)',
                borderRadius: 'var(--r-md)',
                border: isActive ? '1px solid var(--c-gold)' : '1px solid var(--c-border)',
                background: isActive ? 'rgba(201,146,42,0.08)' : '#080d14',
                transition: 'all var(--tr-fast)',
              }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)', minWidth: 24 }}>
                  {c.initiative}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    {isActive && <span style={{ fontSize: 10, color: 'var(--c-gold-l)' }}>▶</span>}
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: isActive ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                      {c.name}
                    </span>
                    {c.is_monster && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-red-l)', background: 'rgba(155,28,28,0.15)', padding: '1px 5px', borderRadius: 3 }}>Monster</span>}
                  </div>
                  {c.is_monster && (
                    <div className="hp-bar-container" style={{ height: 3, marginTop: 4 }}>
                      <div className="hp-bar-fill" style={{ width: `${Math.max(0, hpPct * 100)}%`, background: hpColor }} />
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: hpColor }}>
                    {c.current_hp}/{c.max_hp}
                  </span>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>AC {c.ac}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Party HP overview */}
      {activeSection === 'party' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {party.map(m => {
            const hpPct = m.max_hp > 0 ? m.current_hp / m.max_hp : 0;
            const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : hpPct > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';
            return (
              <div key={m.id} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-3) var(--sp-4)', background: '#080d14', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', overflow: 'hidden', flexShrink: 0, background: 'var(--c-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.avatar_url ? <img src={m.avatar_url} alt={m.name} width={36} height={36} style={{ objectFit: 'cover' }} /> : <span style={{ fontSize: 16 }}>🧙</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{m.name}</span>
                    {m.inspiration && <span title="Inspired" style={{ fontSize: 11 }}>⭐</span>}
                    {m.current_hp <= 0 && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-red-l)', background: 'rgba(155,28,28,0.2)', padding: '1px 5px', borderRadius: 3 }}>Down</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', marginBottom: 3 }}>Lvl {m.level} {m.class_name}</div>
                  <div className="hp-bar-container">
                    <div className="hp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, hpPct * 100))}%`, background: hpColor }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: hpColor }}>{m.current_hp}{m.temp_hp > 0 ? `+${m.temp_hp}` : ''}</div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>/ {m.max_hp} HP</div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>AC {m.armor_class}</div>
                </div>
                {m.active_conditions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxWidth: 80 }}>
                    {m.active_conditions.map(c => <span key={c} className="condition-pill" style={{ fontSize: 8, padding: '1px 4px' }}>{c.slice(0, 3)}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action log */}
      {activeSection === 'log' && (
        <ActionLog campaignId={campaign.id} mode="campaign" maxHeight={500} />
      )}

      {/* DM notes scratch pad */}
      {activeSection === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', flex: 1 }}>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            Private DM scratch pad — only you can see this.
          </p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Monster stats, secret notes, upcoming plot hooks, NPC motivations…"
            rows={16}
            style={{ resize: 'vertical', fontSize: 'var(--fs-sm)', lineHeight: 1.7, fontFamily: 'var(--ff-body)', flex: 1 }}
          />
        </div>
      )}
    </div>
  );
}
