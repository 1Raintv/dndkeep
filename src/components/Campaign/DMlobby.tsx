// v2.286.0 — Phase 1 of the combat-system unification. The legacy
// initiative-on-campaign_sessions model is being retired in favor of
// the modern combat_encounters + combat_participants pipeline (the
// InitiativeStrip + StartCombatButton + CombatProvider flow). This
// component used to host its own "Start Combat" button (which only
// flipped sessionState.combat_active without creating participants —
// the v2.278 root cause of "buttons don't work" reports), an
// InitiativeTracker subtab, and a v1 BattleMap subtab. All three
// have been retired here:
//   - Start Combat button → replaced with an info banner pointing
//     to the header's ⚔ Start Combat (the modern flow).
//   - Combat subtab → removed; InitiativeStrip at the bottom of
//     every page is the canonical combat surface now.
//   - Map subtab → removed; the top-level Battle Map tab covers it.
// Surviving tabs: Players (HP/condition management) + Notes.
//
// v2.292.0 — Phase 2b of the combat-system unification.
// applyPlayerHP and togglePlayerCondition used to write into
// sessionState.initiative_order, which was a known bug from the
// v2.286 transcript: those writes never reached characters.current_hp
// or characters.active_conditions, so the values stayed isolated to
// the Players-tab UI and didn't propagate to the character sheet,
// the Party tab, the Battle Map, or anywhere else. Fix: write the
// canonical columns directly via supabase. The existing campaign-
// level realtime sub on `characters` in CampaignDashboard echoes
// the change back through the playerCharacters prop, so the
// Players-tab UI updates without a manual livePCs merge.
//
// The schema legacy columns (combat_active, initiative_order) stay
// in place — schema cleanup is its own ship to keep this one
// focused on the user-visible win.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SessionState, ConditionName } from '../../types';
import { useToast } from '../shared/Toast';

interface DMlobbyProps {
  campaign: { id: string; name: string; description?: string };
  // v2.292.0 — sessionState is no longer read by this component.
  // applyPlayerHP/togglePlayerCondition write the `characters` table
  // directly now (the canonical source of truth for player HP and
  // active conditions), and the legacy initiative_order merge in
  // livePCs is gone. Keeping the prop as-is so the existing
  // CampaignDashboard mount keeps working unchanged; this component
  // simply doesn't read it. Same back-compat pattern as v2.291's
  // DMScreen migration.
  sessionState: SessionState | null;
  playerCharacters: { id: string; name: string; current_hp: number; max_hp: number; armor_class: number; class_name: string; level: number; conditions: ConditionName[]; active_conditions?: string[]; strength?: number; dexterity?: number; constitution?: number; intelligence?: number; wisdom?: number; charisma?: number; speed?: number }[];
  members: { user_id: string; display_name?: string; email: string; role: string }[];
  isOwner: boolean;
  // v2.292.0 — onUpdateSession is no longer called by this component
  // (HP/condition writes go to the characters table directly). Prop
  // stays for back-compat with the existing mount.
  onUpdateSession: (updates: Partial<SessionState>) => void;
  // v2.286.0 — onToggleCombat dropped. The legacy "Start Combat"
  // button it drove only flipped sessionState.combat_active without
  // creating participants. Modern combat starts via the header
  // <StartCombatButton> in CampaignDashboard. Keeping the prop here
  // as optional for back-compat with any older import sites; this
  // component no longer reads it.
  onToggleCombat?: () => void;
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

export default function DMlobby({ campaign, playerCharacters, members, isOwner }: DMlobbyProps) {
  // v2.286.0 — Tab union slimmed: dropped 'combat' (used the legacy
  // InitiativeTracker which doesn't drive combat_participants) and
  // 'map' (top-level Battle Map tab in CampaignDashboard covers it).
  // v2.292.0 — sessionState/onUpdateSession dropped from destructure.
  // applyPlayerHP and togglePlayerCondition now write characters
  // table directly. The CampaignDashboard's existing realtime sub on
  // characters echoes the UPDATE through playerCharacters prop, so
  // the UI updates without a manual livePCs merge.
  const [activeTab, setActiveTab] = useState<'players'|'notes'>('players');
  const [notes, setNotes] = useState<SceneNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const { showToast } = useToast();

  function addNote() {
    if (!newNote.trim()) return;
    setNotes(prev => [{ id: Date.now().toString(), text: newNote.trim(), created: new Date().toLocaleTimeString() }, ...prev]);
    setNewNote('');
  }

  // v2.292.0 — Apply HP delta directly to the characters table.
  // Was: write into sessionState.initiative_order (which was the
  // root cause of the v2.286-flagged bug — the value never reached
  // the canonical column). Now: read current values off the prop,
  // compute clamped new HP, write characters.current_hp. RLS
  // (`characters: dm can update combat fields`) lets the campaign
  // owner update any character whose campaign_id matches.
  async function applyPlayerHP(pcId: string, delta: number, mode: 'damage'|'heal') {
    const pc = playerCharacters.find(p => p.id === pcId);
    if (!pc) return;
    const newHP = mode === 'damage'
      ? Math.max(0, pc.current_hp - delta)
      : Math.min(pc.max_hp, pc.current_hp + delta);
    const { error } = await supabase
      .from('characters')
      .update({ current_hp: newHP })
      .eq('id', pcId);
    if (error) {
      console.error('[DMlobby] applyPlayerHP failed:', error);
      showToast(`Couldn't update HP: ${error.message}`, 'error');
    }
    // No optimistic local state update needed — the realtime
    // subscription on characters in CampaignDashboard fires an
    // UPDATE echo that flows back through playerCharacters prop.
  }

  // v2.292.0 — Toggle condition directly on characters.active_conditions.
  // The Character row stores the canonical list; legacy code wrote into
  // initiative_order which UI elsewhere never read. Read current list
  // from the prop, toggle membership, write back.
  async function togglePlayerCondition(pcId: string, cond: ConditionName) {
    const pc = playerCharacters.find(p => p.id === pcId);
    if (!pc) return;
    const current = (pc.active_conditions ?? pc.conditions ?? []) as string[];
    const has = current.includes(cond);
    const next = has ? current.filter(x => x !== cond) : [...current, cond];
    const { error } = await supabase
      .from('characters')
      .update({ active_conditions: next })
      .eq('id', pcId);
    if (error) {
      console.error('[DMlobby] togglePlayerCondition failed:', error);
      showToast(`Couldn't update condition: ${error.message}`, 'error');
    }
  }

  // v2.292.0 — livePCs merge gone. We now render playerCharacters
  // directly with a stable shape: characters.active_conditions is
  // the single source of truth for conditions, characters.current_hp
  // for HP. The prop already carries both fresh from the
  // CampaignDashboard's character realtime sub. The local
  // normalizer below just collapses the two condition shapes
  // (active_conditions vs the legacy `conditions` field on the prop
  // type) into one array for the renderer.
  const livePCs = playerCharacters.map(pc => ({
    ...pc,
    conditions: ((pc.active_conditions ?? pc.conditions ?? []) as ConditionName[]),
  }));

  const TABS = [
    { id: 'players', label: `Players (${playerCharacters.length})` },
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
            {/* v2.286.0 — Round/combat-active line dropped. Combat
                status now lives on the InitiativeStrip at the bottom
                of the page (mounted by CampaignDashboard via
                CombatProvider); duplicating it here was confusing
                because the legacy boolean and the modern encounter
                state could disagree. */}
          </div>
        </div>
        {/* v2.286.0 — "Start Combat" button removed. Use the
            ⚔ Start Combat button in the campaign header (top of the
            dashboard) — that one creates a real combat_encounters
            row and seeds participants, which is what the
            InitiativeStrip + AttackResolutionModal + LR/Reaction
            prompts all read from. The legacy toggle here only
            flipped a boolean and was the v2.278 root cause of
            "buttons don't work" reports. */}
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
              color: activeTab === t.id ? 'var(--c-gold-l)' : 'var(--t-2)',
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

      {/* Combat Tab — v2.286.0 retired. Use the header
          ⚔ Start Combat button + the bottom InitiativeStrip. */}

      {/* Battle Map Tab — v2.286.0 retired. Use the top-level
          "Battle Map" tab in the campaign dashboard. */}

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
