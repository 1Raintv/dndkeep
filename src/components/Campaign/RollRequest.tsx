import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────
interface RollRequestRow {
  id: string;
  campaign_id: string;
  requested_by: string;
  target_character_id: string | null;
  target_name: string;
  roll_type: string;
  roll_name: string;
  dc: number | null;
  status: string;
  result: number | null;
  success: boolean | null;
  rolled_by_name: string | null;
  created_at: string;
  completed_at: string | null;
}

interface PlayerChar {
  id: string;
  name: string;
  strength: number; dexterity: number; constitution: number;
  intelligence: number; wisdom: number; charisma: number;
  skill_proficiencies: string[];
  saving_throw_proficiencies: string[];
  level: number;
}

const SKILLS = [
  { name: 'Acrobatics', ability: 'dexterity' },
  { name: 'Animal Handling', ability: 'wisdom' },
  { name: 'Arcana', ability: 'intelligence' },
  { name: 'Athletics', ability: 'strength' },
  { name: 'Deception', ability: 'charisma' },
  { name: 'History', ability: 'intelligence' },
  { name: 'Insight', ability: 'wisdom' },
  { name: 'Intimidation', ability: 'charisma' },
  { name: 'Investigation', ability: 'intelligence' },
  { name: 'Medicine', ability: 'wisdom' },
  { name: 'Nature', ability: 'intelligence' },
  { name: 'Perception', ability: 'wisdom' },
  { name: 'Performance', ability: 'charisma' },
  { name: 'Persuasion', ability: 'charisma' },
  { name: 'Religion', ability: 'intelligence' },
  { name: 'Sleight of Hand', ability: 'dexterity' },
  { name: 'Stealth', ability: 'dexterity' },
  { name: 'Survival', ability: 'wisdom' },
];

const ABILITY_LABELS = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
const ABILITY_KEYS = ['strength','dexterity','constitution','intelligence','wisdom','charisma'] as const;
const PROF_BONUS = (level: number) => Math.ceil(level / 4) + 1;
const MOD = (s: number) => Math.floor((s - 10) / 2);

function rollD20() { return Math.floor(Math.random() * 20) + 1; }

// ── DM Request Panel ──────────────────────────────────────────────
export function DMRollRequestPanel({ campaignId, userId, playerCharacters }: {
  campaignId: string; userId: string;
  playerCharacters: PlayerChar[];
}) {
  const [open, setOpen] = useState(false);
  const [rollType, setRollType] = useState<'skill'|'save'|'ability'>('skill');
  const [rollName, setRollName] = useState('Athletics');
  const [dc, setDc] = useState('');
  const [targetId, setTargetId] = useState<string>('all');
  const [pending, setPending] = useState<RollRequestRow[]>([]);

  useEffect(() => {
    loadPending();
    const ch = supabase.channel(`roll-req-dm-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roll_requests',
        filter: `campaign_id=eq.${campaignId}` }, () => loadPending())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId]);

  async function loadPending() {
    const { data } = await supabase.from('roll_requests')
      .select('*').eq('campaign_id', campaignId)
      .in('status', ['pending', 'completed'])
      .order('created_at', { ascending: false }).limit(20);
    if (data) setPending(data);
  }

  async function sendRequest() {
    const target = playerCharacters.find(p => p.id === targetId);
    await supabase.from('roll_requests').insert({
      campaign_id: campaignId,
      requested_by: userId,
      target_character_id: targetId === 'all' ? null : targetId,
      target_name: targetId === 'all' ? 'All Players' : (target?.name ?? ''),
      roll_type: rollType,
      roll_name: rollName,
      dc: dc ? parseInt(dc) : null,
      status: 'pending',
    });
    setOpen(false);
    setDc('');
  }

  async function dismissRequest(id: string) {
    await supabase.from('roll_requests').update({ status: 'dismissed' }).eq('id', id);
  }

  const activePending = pending.filter(r => r.status === 'pending');
  const recentCompleted = pending.filter(r => r.status === 'completed').slice(0, 5);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', flex: 1 }}>
          Roll Requests
        </div>
        <button onClick={() => setOpen(v => !v)} style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
        }}>
          {open ? 'Cancel' : '+ Request Roll'}
        </button>
      </div>

      {/* Request form */}
      {open && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* Target */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--t-3)', marginBottom: 3 }}>Target</div>
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 7px', borderRadius: 6, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-1)' }}>
              <option value="all">All Players</option>
              {playerCharacters.map(pc => <option key={pc.id} value={pc.id}>{pc.name}</option>)}
            </select>
          </div>

          {/* Roll type tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['skill','save','ability'] as const).map(t => (
              <button key={t} onClick={() => {
                setRollType(t);
                setRollName(t === 'skill' ? 'Athletics' : t === 'save' ? 'Strength Save' : 'Strength');
              }} style={{
                flex: 1, fontSize: 10, fontWeight: 700, padding: '3px 4px', borderRadius: 5, cursor: 'pointer',
                border: rollType === t ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                background: rollType === t ? 'var(--c-gold-bg)' : 'transparent',
                color: rollType === t ? 'var(--c-gold-l)' : 'var(--t-2)',
              }}>{t === 'skill' ? 'Skill' : t === 'save' ? 'Save' : 'Ability'}</button>
            ))}
          </div>

          {/* Roll name picker */}
          {rollType === 'skill' && (
            <select value={rollName} onChange={e => setRollName(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 7px', borderRadius: 6, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-1)' }}>
              {SKILLS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
          {rollType === 'save' && (
            <select value={rollName} onChange={e => setRollName(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 7px', borderRadius: 6, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-1)' }}>
              {ABILITY_LABELS.map(a => <option key={a} value={`${a} Save`}>{a} Save</option>)}
            </select>
          )}
          {rollType === 'ability' && (
            <select value={rollName} onChange={e => setRollName(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 7px', borderRadius: 6, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-1)' }}>
              {ABILITY_LABELS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}

          {/* DC (optional) */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>DC (optional):</span>
            <input type="number" value={dc} onChange={e => setDc(e.target.value)} placeholder="e.g. 15"
              style={{ width: 70, fontSize: 12, padding: '4px 7px' }}/>
          </div>

          <button onClick={sendRequest} className="btn-gold btn-sm" style={{ fontWeight: 700 }}>
            Send Request
          </button>
        </div>
      )}

      {/* Active pending requests */}
      {activePending.map(req => (
        <div key={req.id} style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '8px 10px', marginBottom: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-gold-l)' }}>
                ⏳ {req.roll_name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--t-3)', marginLeft: 6 }}>
                → {req.target_name}{req.dc ? ` · DC ${req.dc}` : ''}
              </span>
            </div>
            <button onClick={() => dismissRequest(req.id)} style={{ fontSize: 9, background: 'none', border: 'none', color: 'var(--t-3)', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      ))}

      {/* Recent completed */}
      {recentCompleted.map(req => (
        <div key={req.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '7px 10px', marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: req.success ? '#22c55e' : req.dc ? '#ef4444' : 'var(--t-1)' }}>
                {req.success === true ? '✓' : req.success === false ? '✗' : ''} {req.roll_name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--t-3)', marginLeft: 6 }}>
                {req.rolled_by_name} rolled {req.result}{req.dc ? ` vs DC ${req.dc}` : ''}
              </span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, color: req.success === true ? '#22c55e' : req.success === false ? '#ef4444' : 'var(--c-gold-l)' }}>
              {req.result}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Player Roll Prompt (floating, shown on character sheet) ────────
export function PlayerRollPrompt({ campaignId, characterId, character }: {
  campaignId: string; characterId: string;
  character: PlayerChar;
}) {
  const [requests, setRequests] = useState<RollRequestRow[]>([]);

  useEffect(() => {
    loadRequests();
    const ch = supabase.channel(`roll-req-player-${characterId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roll_requests',
        filter: `campaign_id=eq.${campaignId}` }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, characterId]);

  async function loadRequests() {
    const { data } = await supabase.from('roll_requests').select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .or(`target_character_id.eq.${characterId},target_character_id.is.null`)
      .order('created_at', { ascending: false });
    if (data) setRequests(data);
  }

  async function performRoll(req: RollRequestRow) {
    // Calculate the bonus
    const skill = SKILLS.find(s => s.name === req.roll_name);
    const abilityKey = skill
      ? skill.ability as typeof ABILITY_KEYS[number]
      : ABILITY_KEYS.find(k => req.roll_name.toLowerCase().includes(k.slice(0,3).toLowerCase()))
        ?? 'strength';

    const baseScore = character[abilityKey] ?? 10;
    const baseMod = MOD(baseScore);
    const profBonus = PROF_BONUS(character.level);

    let totalMod = baseMod;
    if (req.roll_type === 'skill' && character.skill_proficiencies?.some(p => p.toLowerCase().includes(req.roll_name.toLowerCase()))) {
      totalMod += profBonus;
    }
    if (req.roll_type === 'save' && character.saving_throw_proficiencies?.some(p => req.roll_name.toLowerCase().includes(p.toLowerCase()))) {
      totalMod += profBonus;
    }

    const d20 = rollD20();
    const total = d20 + totalMod;
    const success = req.dc ? total >= req.dc : null;

    // Update the request
    await supabase.from('roll_requests').update({
      status: 'completed',
      result: total,
      success,
      rolled_by_name: character.name,
      completed_at: new Date().toISOString(),
    }).eq('id', req.id);

    // Log to action_logs so everyone sees it
    await supabase.from('action_logs').insert({
      campaign_id: campaignId,
      character_id: characterId,
      character_name: character.name,
      action_type: 'roll',
      action_name: req.roll_name,
      target_name: '',
      dice_expression: `1d20${totalMod >= 0 ? '+' : ''}${totalMod}`,
      individual_results: [d20],
      total,
      hit_result: req.dc ? (success ? `✓ Success (DC ${req.dc})` : `✗ Failure (DC ${req.dc})`) : '',
      notes: `DM requested ${req.roll_name}`,
    });

    // Remove from local list
    setRequests(prev => prev.filter(r => r.id !== req.id));
  }

  async function dismissRequest(id: string) {
    await supabase.from('roll_requests').update({ status: 'dismissed' }).eq('id', id);
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  if (requests.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      zIndex: 150, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {requests.map(req => {
        // Calculate bonus preview
        const skill = SKILLS.find(s => s.name === req.roll_name);
        const abilityKey = skill
          ? skill.ability as typeof ABILITY_KEYS[number]
          : ABILITY_KEYS.find(k => req.roll_name.toLowerCase().includes(k.slice(0,3).toLowerCase())) ?? 'strength';
        const baseScore = character[abilityKey] ?? 10;
        const baseMod = MOD(baseScore);
        const profBonus = PROF_BONUS(character.level);
        let totalMod = baseMod;
        if (req.roll_type === 'skill' && character.skill_proficiencies?.some(p => p.toLowerCase().includes(req.roll_name.toLowerCase()))) totalMod += profBonus;
        if (req.roll_type === 'save' && character.saving_throw_proficiencies?.some(p => req.roll_name.toLowerCase().includes(p.toLowerCase()))) totalMod += profBonus;

        return (
          <div key={req.id} style={{
            pointerEvents: 'all',
            background: 'linear-gradient(160deg, #1a1f2e, #0d1117)',
            border: '2px solid var(--c-gold-bdr)',
            borderRadius: 14, padding: '14px 18px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,160,23,0.2)',
            display: 'flex', flexDirection: 'column', gap: 10, minWidth: 280,
            animation: 'fadeIn 300ms ease both',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                DM requests a roll
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-gold-l)' }}>
                {req.roll_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-2)', marginTop: 2 }}>
                Modifier: {totalMod >= 0 ? '+' : ''}{totalMod}
                {req.dc && <span style={{ marginLeft: 8, color: '#f97316' }}>DC {req.dc}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => performRoll(req)} className="btn-gold" style={{
                flex: 2, fontWeight: 800, fontSize: 13, justifyContent: 'center',
              }}>
                Roll!
              </button>
              <button onClick={() => dismissRequest(req.id)} style={{
                flex: 1, fontSize: 11, fontWeight: 700, padding: '7px 8px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--t-2)',
              }}>Skip</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
