import { useState } from 'react';
import BattleMap from './BattleMap';
import type { SessionState, ConditionName } from '../../types';
import InitiativeTracker from './InitiativeTracker';

interface DMlobbyProps {
  campaign: { id: string; name: string; description?: string };
  sessionState: SessionState | null;
  playerCharacters: { id: string; name: string; current_hp: number; max_hp: number; armor_class: number; class_name: string; level: number; conditions: ConditionName[]; active_conditions?: string[]; strength?: number; dexterity?: number; constitution?: number; intelligence?: number; wisdom?: number; charisma?: number; speed?: number }[];
  members: { user_id: string; display_name?: string; email: string; role: string }[];
  isOwner: boolean;
  onUpdateSession: (updates: Partial<SessionState>) => void;
  onToggleCombat: () => void;
}

interface SceneNote {
  id: string;
  text: string;
  created: string;
}

const CONDITIONS = ['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];

function PlayerCard({ pc, isOwner, onApplyHP, onToggleCondition }: {
  pc: DMlobbyProps['playerCharacters'][0];
  isOwner: boolean;
  onApplyHP: (id: string, delta: number, mode: 'damage'|'heal') => void;
  onToggleCondition: (id: string, cond: ConditionName) => void;
}) {
  const [delta, setDelta] = useState('');
  const [expanded, setExpanded] = useState(false);
  const hpPct = pc.max_hp > 0 ? pc.current_hp / pc.max_hp : 0;
  const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : pc.current_hp > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';

  return (
    <div style={{ background:'var(--c-surface)', borderRadius:'var(--r-md)', border:'1px solid var(--c-border)', overflow:'hidden' }}>
      <div style={{ padding:'var(--sp-3) var(--sp-4)', display:'flex', gap:'var(--sp-3)', alignItems:'center' }}>
        {/* Name + class */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--ff-body)', fontWeight:700, fontSize:'var(--fs-sm)', color:'var(--t-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pc.name}</div>
          <div style={{ fontSize:'var(--fs-xs)', color:'var(--t-2)' }}>Level {pc.level} {pc.class_name}</div>
        </div>
        {/* HP bar + numbers */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, minWidth:80 }}>
          <span style={{ fontFamily:'var(--ff-body)', fontSize:'var(--fs-sm)', fontWeight:700, color:hpColor }}>{pc.current_hp}/{pc.max_hp} HP</span>
          <div style={{ width:80, height:4, background:'#080d14', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.max(0, Math.min(100, hpPct*100))}%`, background:hpColor, transition:'width 0.3s' }} />
          </div>
        </div>
        {/* AC */}
        <div style={{ textAlign:'center', minWidth:44 }}>
          <div style={{ fontFamily:'var(--ff-body)', fontWeight:700, fontSize:'var(--fs-sm)' }}>{pc.armor_class}</div>
          <div style={{ fontSize:9, color:'var(--t-2)' }}>AC</div>
        </div>
        {/* Conditions badge */}
        {pc.conditions?.length > 0 && <span className="badge badge-crimson">{pc.conditions.length}</span>}
        {isOwner && (
          <button className="btn-ghost btn-sm" onClick={() => setExpanded(v=>!v)} style={{ fontSize:'var(--fs-xs)' }}>
            {expanded ? 'Less' : 'More'}
          </button>
        )}
      </div>
      {expanded && isOwner && (
        <div style={{ padding:'var(--sp-3) var(--sp-4)', borderTop:'1px solid var(--c-border)', background:'#080d14', display:'flex', flexDirection:'column', gap:'var(--sp-3)' }}>
          <div style={{ display:'flex', gap:'var(--sp-2)', alignItems:'center' }}>
            <input type="number" min="1" placeholder="Amount" value={delta} onChange={e=>setDelta(e.target.value)} style={{ width:80, textAlign:'center', fontSize:'var(--fs-sm)' }} />
            <button className="btn-danger btn-sm" onClick={()=>{ if(parseInt(delta)>0){ onApplyHP(pc.id, parseInt(delta), 'damage'); setDelta(''); } }} disabled={!delta}>Damage</button>
            <button className="btn-gold btn-sm" onClick={()=>{ if(parseInt(delta)>0){ onApplyHP(pc.id, parseInt(delta), 'heal'); setDelta(''); } }} disabled={!delta}>Heal</button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {CONDITIONS.map(cond => {
              const active = pc.conditions?.includes(cond as any);
              return (
                <button key={cond} onClick={()=>onToggleCondition(pc.id, cond as ConditionName)} style={{ fontFamily:'var(--ff-body)', fontWeight:600, fontSize:9, padding:'2px 6px', borderRadius:'var(--r-sm)', border: active?'1px solid var(--c-red-l)':'1px solid var(--c-border)', background: active?'rgba(220,38,38,0.15)':'var(--c-raised)', color: active?'#fca5a5':'var(--t-2)', cursor:'pointer' }}>
                  {cond}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DMlobby({ campaign, sessionState, playerCharacters, members, isOwner, onUpdateSession, onToggleCombat }: DMlobbyProps) {
  const [activeTab, setActiveTab] = useState<'players'|'combat'|'map'|'notes'>('players');
  const [notes, setNotes] = useState<SceneNote[]>([]);
  const [newNote, setNewNote] = useState('');

  function addNote() {
    if (!newNote.trim()) return;
    setNotes(prev => [{ id: Date.now().toString(), text: newNote.trim(), created: new Date().toLocaleTimeString() }, ...prev]);
    setNewNote('');
  }

  // Apply HP to a player character in the session state
  function applyPlayerHP(pcId: string, delta: number, mode: 'damage'|'heal') {
    const order = sessionState?.initiative_order ?? [];
    const updated = order.map(c => {
      if (c.id !== pcId) return c;
      const newHP = mode === 'damage' ? Math.max(0, c.current_hp - delta) : Math.min(c.max_hp, c.current_hp + delta);
      return { ...c, current_hp: newHP };
    });
    onUpdateSession({ initiative_order: updated });
  }

  function togglePlayerCondition(pcId: string, cond: ConditionName) {
    const order = sessionState?.initiative_order ?? [];
    const updated = order.map(c => {
      if (c.id !== pcId) return c;
      const has = c.conditions.includes(cond);
      return { ...c, conditions: has ? c.conditions.filter(x=>x!==cond) : [...c.conditions, cond as ConditionName] };
    });
    onUpdateSession({ initiative_order: updated });
  }

  // Merge player characters with session state for live HP
  const livePCs = playerCharacters.map(pc => {
    const sessionPC = sessionState?.initiative_order?.find(c => c.id === pc.id);
    return {
      ...pc,
      current_hp: sessionPC?.current_hp ?? pc.current_hp,
      conditions: (sessionPC?.conditions ?? pc.conditions ?? []) as ConditionName[],
    };
  });

  const TABS = [
    { id: 'players', label: `Players (${playerCharacters.length})` },
    { id: 'combat', label: sessionState?.combat_active ? '⚔ Combat Active' : 'Combat' },
    { id: 'map', label: '🗺 Battle Map' },
    { id: 'notes', label: `Notes${notes.length > 0 ? ` (${notes.length})` : ''}` },
  ];

  return (
    <div style={{ maxWidth:720 }}>
      {/* DM Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'var(--sp-5)', padding:'var(--sp-4)', background:'var(--c-raised)', borderRadius:'var(--r-md)', border:'1px solid var(--c-gold-bdr)' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'var(--sp-2)', marginBottom:4 }}>
            <span className="badge badge-gold">DM</span>
            <span style={{ fontFamily:'var(--ff-body)', fontWeight:700, fontSize:'var(--fs-md)', color:'var(--c-gold-l)' }}>{campaign.name}</span>
          </div>
          <div style={{ display:'flex', gap:'var(--sp-4)', fontSize:'var(--fs-xs)', color:'var(--t-2)', fontFamily:'var(--ff-body)' }}>
            <span>{members.length} player{members.length !== 1 ? 's' : ''}</span>
            <span>{playerCharacters.length} character{playerCharacters.length !== 1 ? 's' : ''}</span>
            {sessionState?.combat_active && (
              <span style={{ color:'var(--c-red-l)' }}>Round {sessionState.round} — Combat Active</span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:'var(--sp-2)' }}>
          {isOwner && (
            <button
              className={sessionState?.combat_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
              onClick={onToggleCombat}
            >
              {sessionState?.combat_active ? 'End Combat' : 'Start Combat'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:'var(--sp-1)', marginBottom:'var(--sp-4)', borderBottom:'1px solid var(--c-border)', paddingBottom:'var(--sp-1)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            style={{
              fontFamily:'var(--ff-body)', fontWeight:600, fontSize:'var(--fs-sm)',
              padding:'var(--sp-2) var(--sp-4)', borderRadius:'var(--r-md) var(--r-md) 0 0',
              border: activeTab === t.id ? '1px solid var(--c-border)' : '1px solid transparent',
              borderBottom: activeTab === t.id ? '1px solid var(--bg-base)' : 'none',
              background: activeTab === t.id ? 'var(--c-surface)' : 'transparent',
              color: activeTab === t.id ? (t.id === 'combat' && sessionState?.combat_active ? 'var(--c-red-l)' : 'var(--c-gold-l)') : 'var(--t-2)',
              cursor:'pointer', marginBottom:-1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Players Tab */}
      {activeTab === 'players' && (
        <div>
          {livePCs.length === 0 ? (
            <div className="panel" style={{ textAlign:'center', padding:'var(--sp-8)' }}>
              <p style={{ color:'var(--t-2)', fontFamily:'var(--ff-body)', fontSize:'var(--fs-sm)', marginBottom:'var(--sp-2)' }}>
                No characters in this campaign yet.
              </p>
              <p style={{ color:'var(--t-2)', fontFamily:'var(--ff-body)', fontSize:'var(--fs-xs)' }}>
                Players assign characters from their character sheet → Settings → Campaign.
              </p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-3)' }}>
              {livePCs.map(pc => (
                <PlayerCard
                  key={pc.id} pc={pc} isOwner={isOwner}
                  onApplyHP={applyPlayerHP}
                  onToggleCondition={togglePlayerCondition}
                />
              ))}
            </div>
          )}

          {/* Party summary */}
          {livePCs.length > 0 && (
            <div style={{ marginTop:'var(--sp-4)', padding:'var(--sp-3) var(--sp-4)', background:'#080d14', borderRadius:'var(--r-md)', border:'1px solid var(--c-border)' }}>
              <div className="section-header" style={{ marginBottom:'var(--sp-2)' }}>Party Summary</div>
              <div style={{ display:'flex', gap:'var(--sp-6)', flexWrap:'wrap', fontFamily:'var(--ff-body)', fontSize:'var(--fs-sm)' }}>
                <div>
                  <span style={{ color:'var(--t-2)' }}>Total HP </span>
                  <span style={{ color:'var(--hp-full)', fontWeight:700 }}>
                    {livePCs.reduce((s,p)=>s+p.current_hp,0)} / {livePCs.reduce((s,p)=>s+p.max_hp,0)}
                  </span>
                </div>
                <div>
                  <span style={{ color:'var(--t-2)' }}>Down </span>
                  <span style={{ color: livePCs.filter(p=>p.current_hp===0).length>0?'var(--hp-dead)':'var(--t-2)', fontWeight:700 }}>
                    {livePCs.filter(p=>p.current_hp===0).length}
                  </span>
                </div>
                <div>
                  <span style={{ color:'var(--t-2)' }}>Conditions </span>
                  <span style={{ color: livePCs.reduce((s,p)=>s+(p.conditions?.length??0),0)>0?'var(--c-red-l)':'var(--t-2)', fontWeight:700 }}>
                    {livePCs.reduce((s,p)=>s+(p.conditions?.length??0),0)}
                  </span>
                </div>
                <div>
                  <span style={{ color:'var(--t-2)' }}>Avg Level </span>
                  <span style={{ fontWeight:700 }}>
                    {Math.round(livePCs.reduce((s,p)=>s+p.level,0)/livePCs.length)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Combat Tab */}
      {activeTab === 'combat' && (
        <InitiativeTracker
          sessionState={sessionState}
          isOwner={isOwner}
          playerCharacters={playerCharacters.map(pc => ({
            id: pc.id, name: pc.name,
            current_hp: pc.current_hp, max_hp: pc.max_hp,
            armor_class: pc.armor_class, initiative_bonus: 0,
          }))}
          onUpdateSession={onUpdateSession}
          onToggleCombat={onToggleCombat}
        />
      )}

      {/* Battle Map Tab */}
      {activeTab === 'map' && (
        <BattleMap
          campaignId={campaign.id}
          isDM={true}
          userId={''}
          playerCharacters={playerCharacters.map(pc => ({
            id: pc.id,
            name: pc.name,
            class_name: pc.class_name,
            level: pc.level,
            current_hp: pc.current_hp,
            max_hp: pc.max_hp,
            armor_class: pc.armor_class,
            active_conditions: pc.active_conditions ?? pc.conditions.map(String) ?? [],
            strength: pc.strength ?? 10,
            dexterity: pc.dexterity ?? 10,
            constitution: pc.constitution ?? 10,
            intelligence: pc.intelligence ?? 10,
            wisdom: pc.wisdom ?? 10,
            charisma: pc.charisma ?? 10,
            speed: pc.speed ?? 30,
          }))}
        />
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div>
          <p style={{ fontSize:'var(--fs-xs)', color:'var(--t-2)', fontFamily:'var(--ff-body)', marginBottom:'var(--sp-3)' }}>
            Session notes are local to your device and reset when you refresh. Use them for quick reminders during play.
          </p>
          <div style={{ display:'flex', gap:'var(--sp-2)', marginBottom:'var(--sp-4)' }}>
            <textarea
              value={newNote}
              onChange={e=>setNewNote(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); addNote(); }}}
              placeholder="Add a note... (Enter to save, Shift+Enter for newline)"
              style={{ flex:1, minHeight:72, resize:'vertical', fontSize:'var(--fs-sm)' }}
            />
            <button className="btn-primary" onClick={addNote} disabled={!newNote.trim()} style={{ alignSelf:'flex-end' }}>
              Add
            </button>
          </div>
          {notes.length === 0 ? (
            <div className="panel" style={{ textAlign:'center', padding:'var(--sp-6)' }}>
              <p style={{ color:'var(--t-2)', fontFamily:'var(--ff-body)', fontSize:'var(--fs-sm)' }}>No notes yet.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-2)' }}>
              {notes.map(note => (
                <div key={note.id} style={{ padding:'var(--sp-3) var(--sp-4)', background:'var(--c-surface)', borderRadius:'var(--r-md)', border:'1px solid var(--c-border)', display:'flex', gap:'var(--sp-3)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'var(--fs-xs)', color:'var(--t-2)', fontFamily:'var(--ff-body)', marginBottom:4 }}>{note.created}</div>
                    <div style={{ fontSize:'var(--fs-sm)', color:'var(--t-2)', whiteSpace:'pre-wrap', lineHeight:1.5 }}>{note.text}</div>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={()=>setNotes(prev=>prev.filter(n=>n.id!==note.id))} style={{ color:'var(--t-2)', alignSelf:'flex-start', fontSize:'var(--fs-xs)' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
