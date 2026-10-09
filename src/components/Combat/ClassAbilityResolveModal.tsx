import {conditionsAutoFailSave,conditionsDisadvantageSave} from '../../lib/conditions';
import {rollSavingThrow} from '../../rules/savingThrows';
import {getPsionicGuardsSaveAdvantage} from '../../lib/api/psionicDisciplines';
// v2.247.0 — Class-ability save resolver modal.
//
// Opens when a player clicks Use on a save-bearing class ability
// (any ability with a `save?` field on its data definition) AND an
// active combat encounter exists for the campaign. Out of combat,
// the existing handleUseAbility path is unchanged.
//
// What it does:
//   1. Lists eligible targets, filtered by `ability.save.targetMode`:
//        'enemies' → NPC + monster participants only
//        'allies'  → other PC participants (excludes caster)
//        'any'     → everyone except the caster
//   2. Per target, exposes:
//        [Roll Save]             — rolls d20 + target bonus against DC
//        [Mark Pass] / [Mark Fail] — manual outcome recorder
//        [Auto-Fail (willing)]   — visible only for PC targets when
//                                  `willing_ally_auto_fail` resolves
//                                  to 'auto' (one-click) or 'prompt'
//                                  (with confirm). Records the save
//                                  as failed without rolling, per
//                                  PHB 2024 p.235 ("a creature can
//                                  voluntarily fail a saving throw").
//   3. On Confirm:
//        — fires onConfirmed(outcomes) so the parent runs PED deduction
//          and the outcome-aware action-log entry
//        — closes
//
// v2.752 — Load target bonuses and the existing character save house rule
// before enabling Roll Save; manual outcomes remain available.
//
// Why a separate modal instead of routing through pendingAttacks: class
// abilities like Telekinesis don't deal damage — they apply positional
// or status effects. The pendingAttacks pipeline is geared toward
// damage flow (save → half/zero/full damage). Bolting non-damage
// outcomes onto it is a bigger refactor than v2.247 wants. This modal
// stands alone and logs to the action log; v2.248+ can decide whether
// to migrate to a unified pipeline.

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { resolveAutomation } from '../../lib/automations';
import { logAction } from '../shared/ActionLog';
import { getTargetSaveBonus } from '../../lib/pendingAttack';
import { isHostileTo, rankTargets, targetGroup } from '../../rules/targetOrder';
import { TargetGroupChip } from './TargetGroupChip';
import type { Character, Campaign, CombatParticipant } from '../../types';
import type { ClassAbility, SaveSpec } from '../../data/classAbilities';
// v2.486.0 — In-app confirm replaces window.confirm() for the
// "voluntarily fail this save?" prompt.
import { useModal } from '../shared/Modal';

// v2.316: HP/conditions/buffs/death-save reads come from combatants via JOIN.
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from '../../lib/combatParticipantNormalize';

// v2.443.0 — TargetOutcome / SaveOutcome / formatOutcomesLog moved
// to src/lib/classAbilityOutcomes.ts so the parent (ClassAbilitiesSection)
// can import them without dragging in the entire modal. Re-exported
// here for backward compat with any other consumers.
export type { SaveOutcome, TargetOutcome } from '../../lib/classAbilityOutcomes';
export { formatOutcomesLog } from '../../lib/classAbilityOutcomes';
import type { SaveOutcome, TargetOutcome } from '../../lib/classAbilityOutcomes';

interface Props {
  /** A persisted declaration cannot switch targets or encounters during resolution. */
  boundTarget?:{participantId:string;encounterId:string};
  open: boolean;
  onClose: () => void;
  ability: ClassAbility;
  /** Pre-resolved numeric DC. Caller computes via `resolveSaveDC`
   *  (matches what the chip in ClassAbilitiesSection shows). */
  saveDC: number;
  character: Character;
  campaign: Campaign | null;
  campaignId: string;
  /** Fired when the player clicks Confirm. The parent uses this to
   *  finalize ability use (PED deduction, increment feature_uses)
   *  and emit the outcome-aware log entry. */
  onConfirmed: (outcomes: TargetOutcome[]) => void;
}

/** Filter participants by the ability's targetMode. Caster is always
 *  excluded — abilities like Telekinesis can technically self-target
 *  but the v2.247 picker keeps the table simple by never listing the
 *  caster. If self-targeting becomes important, add a 'self' targetMode
 *  in v2.248+. */
function filterTargets(
  participants: CombatParticipant[],
  casterParticipantId: string | null,
  save: SaveSpec,
): CombatParticipant[] {
  const mode = save.targetMode ?? 'any';
  // v2.746.0 — dead participants are no longer dropped (they rank last
  // with a DEAD chip instead); side checks go through rules/targetOrder
  // so every picker agrees on who is an enemy. Then rankTargets orders
  // the list: enemies, allies, at 0 HP, dead.
  const caster = { id: casterParticipantId ?? '', participant_type: 'character' };
  const filtered = participants.filter(p => {
    if (p.id === casterParticipantId) return false;
    if (mode === 'enemies') return isHostileTo(p, caster);
    if (mode === 'allies') return !isHostileTo(p, caster);
    return true; // 'any'
  });
  return rankTargets(filtered, { self: caster }).map(r => r.target);
}

export default function ClassAbilityResolveModal({
  open, onClose, ability, saveDC, character, campaign, campaignId, onConfirmed, boundTarget,
}: Props) {
  const singleTarget=!!boundTarget||ability.psionicUse?.kind==='propel';
  const [checking,setChecking]=useState(false),[saveError,setSaveError]=useState('');
  const busy=useRef(false),generation=useRef(0);
  const context=JSON.stringify([open,campaignId,character.id,ability.name,ability.save,ability.psionicUse,saveDC,boundTarget]);
  const latest=useRef(context);latest.current=context;
  useEffect(()=>{busy.current=false;setChecking(false);setSaveError('');return()=>{generation.current++;};},[context]);
  const [selectedTarget,setSelectedTarget]=useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // v2.486.0 — In-app confirm hook for "voluntarily fail" prompt.
  const { confirm: confirmModal } = useModal();
  const [casterParticipantId, setCasterParticipantId] = useState<string | null>(null);
  const [targets, setTargets] = useState<CombatParticipant[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, TargetOutcome>>({});
  // v2.249.0 — per-target save bonus. Loaded async after the targets
  // load so the modal renders responsively (targets first, bonuses
  // hydrate when ready). `confidence: 'low'` flags fallbacks (e.g. a
  // STR save on an NPC whose ability scores aren't on file) — the row
  // shows a "?" indicator and the input is auto-focusable so the
  // player/DM can override before rolling.
  const [saveBonuses, setSaveBonuses] = useState<Record<string, {
    bonus: number;
    breakdown: string;
    confidence: 'high' | 'low';
    naturalExtremes?: boolean;
  }>>({});

  const willingFailMode = resolveAutomation('willing_ally_auto_fail', character, campaign);

  // Load encounter + participants on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setOutcomes({});
      setSelectedTarget(boundTarget?.participantId??'');
      setSaveBonuses({});

      const { data: enc } = await supabase
        .from('combat_encounters')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .maybeSingle();
      if (cancelled) return;
      if (boundTarget&&enc?.id!==boundTarget.encounterId) {
        setTargets([]);setError('The declared encounter is no longer active. Keep this saved use for manual resolution.');setLoading(false);return;
      }
      if (!enc?.id) {
        setError('No active combat encounter.');
        setLoading(false);
        return;
      }

      const { data: caster } = await supabase
        .from('combat_participants')
        .select('id')
        .eq('encounter_id', enc.id)
        .eq('entity_id', character.id)
        .eq('participant_type', 'character')
        .maybeSingle();
      if (cancelled) return;
      const casterId = (caster?.id as string) ?? null;
      setCasterParticipantId(casterId);

      const { data: allRaw } = await (supabase as any)
        .from('combat_participants')
        .select('*, ' + JOINED_COMBATANT_FIELDS)
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
  const all = ((allRaw ?? []) as any[]).map(normalizeParticipantRow);
      if (cancelled) return;

      const list = ((all ?? []) as CombatParticipant[]);
      const eligible = ability.save ? filterTargets(list, casterId, ability.save) : [];
      const filtered = boundTarget?eligible.filter(p=>p.id===boundTarget.participantId):eligible;
      if(boundTarget&&filtered.length!==1)setError('The declared target is no longer available. Keep this saved use for manual resolution.');
      setTargets(filtered);
      setOutcomes(Object.fromEntries(filtered.map(p => [p.id, {
        participantId: p.id,
        participantName: p.name,
        outcome: 'pending' as SaveOutcome,
      }])));
      setLoading(false);

      // v2.249.0 — fan-out save-bonus fetches. Each call hits two tables
      // (combat_participants → characters | npcs) so we issue them in
      // parallel rather than sequentially. setState is per-target so the
      // chips populate as they arrive instead of all-or-nothing.
      if (ability.save) {
        const saveAbility = ability.save.ability;
        await Promise.all(filtered.map(async p => {
          const result = await getTargetSaveBonus(p.id, saveAbility);
          if (cancelled) return;
          setSaveBonuses(prev => ({
            ...prev,
            [p.id]: {
              bonus: result.bonus,
              breakdown: result.breakdown,
              confidence: result.confidence ?? 'high',
              naturalExtremes: result.naturalExtremes ?? false,
            },
          }));
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [context]);

  if (!open) return null;

  function setOutcome(participantId: string, outcome: SaveOutcome, d20?: number, total?: number, bonus?: number, rolls?:number[],advantage?:boolean,naturalExtremes?:boolean,disadvantage?:boolean,automaticFailure?:boolean) {
    setOutcomes(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        outcome,
        d20,
        total,
        bonus,
        rolls,advantage,naturalExtremes,disadvantage,automaticFailure,
      },
    }));
  }

  // v2.249.0 — manual bonus override. Lets the player/DM edit the
  // computed bonus before rolling (useful for low-confidence NPC/
  // monster rows, or when a buff/condition modifies the save in a way
  // we don't track).
  function setBonusOverride(participantId: string, value: number) {
    setSaveBonuses(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        bonus: value,
        breakdown: `${value >= 0 ? '+' : ''}${value} (manual override)`,
        confidence: prev[participantId]?.confidence ?? 'low',
      },
    }));
  }

  // v2.752 — Ordinary saves use total vs DC unless the target opted into
  // natural extremes. Manual bonus edits must retain that preference.
  async function rollForTarget(p: CombatParticipant) {
    if (!saveBonuses[p.id] || busy.current) return;
    busy.current=true;setChecking(true);setSaveError('');
    const issued=generation.current,bonus=saveBonuses[p.id].bonus;
    const current=()=>issued===generation.current&&latest.current===context;
    try {
      const conditions=p.active_conditions??[],automaticFailure=conditionsAutoFailSave(conditions,ability.save?.ability??'');
      const disadvantage=!automaticFailure&&conditionsDisadvantageSave(conditions,ability.save?.ability??'');
      const advantage=!automaticFailure&&p.participant_type==='character'&&!!p.entity_id&&
        await getPsionicGuardsSaveAdvantage(p.entity_id,ability.save?.ability??'');
      if(!current())return;
      const roll=rollSavingThrow(bonus,saveDC,{advantage,disadvantage,forceFailure:automaticFailure,naturalExtremes:saveBonuses[p.id].naturalExtremes});
      setOutcome(p.id,roll.passed?'passed':'failed',roll.d20,roll.total,bonus,roll.rolls,advantage,saveBonuses[p.id].naturalExtremes??false,disadvantage||undefined,automaticFailure||undefined);
    }catch(error){if(current())setSaveError(error instanceof Error?error.message:'Protection could not be verified. Try again.');}
    finally{if(current()){busy.current=false;setChecking(false);}}
  }

  async function autoFail(p: CombatParticipant) {
    if (willingFailMode === 'prompt') {
      // v2.486.0 — In-app confirm via useModal.
      const ok = await confirmModal({
        title: `Voluntarily fail save?`,
        message: `Mark ${p.name} as voluntarily failing the ${ability.save?.ability} save. RAW PHB 2024 — a creature can choose to fail a save.`,
        confirmLabel: 'Auto-fail',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
    }
    setOutcome(p.id, 'auto-failed');
  }

  function handleConfirm() {
    if(busy.current)return;
    const resolved=singleTarget?[outcomes[selectedTarget]].filter(Boolean):Object.values(outcomes);
    if(singleTarget&&(resolved.length!==1||resolved[0].outcome==='pending'))return;
    onConfirmed(resolved);
    onClose();
  }

  const visibleTargets=singleTarget?targets.filter(t=>t.id===selectedTarget):targets;
  const allResolved = visibleTargets.length > 0
    && visibleTargets.every(t => outcomes[t.id]?.outcome !== 'pending');

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={`${ability.name} saving throws`}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '2px solid #a78bfa',
          boxShadow: '0 0 40px rgba(167,139,250,0.4), 0 10px 40px rgba(0,0,0,0.8)',
          maxWidth: 520, width: '100%',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: 'rgba(167,139,250,0.15)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#a78bfa',
          }}>
            Resolve Saves · DC {saveDC} {ability.save?.ability}
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--t-1)', marginTop: 2,
          }}>
            {ability.name}
          </div>
          {ability.save?.onFailure && (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', marginTop: 4 }}>
              On fail: {ability.save.onFailure}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--t-3)' }}>Loading encounter…</div>
          ) : error ? (
            <div style={{
              padding: 8, borderRadius: 5,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
              color: '#f87171', fontSize: 11,
            }}>
              {error}
            </div>
          ) : targets.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-3)' }}>
              No valid targets in this encounter for {ability.save?.targetMode ?? 'any'} mode.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saveError&&<p role="alert" style={{color:'#f87171',fontSize:12}}>{saveError}</p>}
              {checking&&<p role="status">Checking protection…</p>}
              {singleTarget&&<div style={{marginBottom:12}}><p>Choose one Large or smaller creature other than yourself that you can see within 30 ft. {ability.psionicUse?.kind==='propel'&&ability.psionicUse.movement==='warp'?'On failure, teleport to an unoccupied space you can see within 30 ft of you, horizontal to you.':'Apply movement straight toward or away from you.'}</p><p>{ability.psionicUse?.kind==='propel'?(ability.psionicUse.mode==='free'?(ability.psionicUse.movement==='warp'?'No Energy Die required.':'Free: 5 ft on a failed save.'):`Rolled ${ability.psionicUse.roll}: ${ability.psionicUse.movement==='warp'?'teleport destination remains within 30 ft of you':`${ability.psionicUse.roll*5} ft on failure`}. ${ability.psionicUse.mode==='powered'?'Spend 1 die only on failure.':'No die spent.'}`):''}</p><label>Propel target<select disabled={checking||!!boundTarget} aria-label="Propel target" value={selectedTarget} onChange={e=>setSelectedTarget(e.target.value)} style={{width:'100%'}}><option value="">Choose one target</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>}
              {visibleTargets.map(p => {
                const out = outcomes[p.id];
                const showAutoFail =
                  willingFailMode !== 'off' &&
                  p.participant_type === 'character';
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '8px 10px', borderRadius: 6,
                      background: 'var(--c-raised)',
                      border: `1px solid ${
                        out?.outcome === 'passed' ? 'rgba(74,222,128,0.5)' :
                        out?.outcome === 'failed' || out?.outcome === 'auto-failed' ? 'rgba(239,68,68,0.5)' :
                        'var(--c-border)'
                      }`,
                    }}
                  >
                    {/* Row 1: name + outcome chip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', flex: 1 }}>
                        {p.name}
                        <span style={{ color: 'var(--t-3)', marginLeft: 6, fontSize: 10 }}>
                          · {p.participant_type}
                        </span>
                      </span>
                      {/* v2.746 — DOWNED / DEAD chip (list is ranked by rules/targetOrder). */}
                      <TargetGroupChip group={targetGroup(p, { id: casterParticipantId ?? '', participant_type: 'character' })} />
                      {/* v2.249.0 — d20 + bonus = total chip. Replaces the
                          v2.247 "d20: N" pill once the player has rolled. */}
                      {out?.d20 !== undefined && !out.automaticFailure && (
                        <span
                          title={out.bonus !== undefined ? `d20 ${out.d20} ${out.bonus >= 0 ? '+' : ''}${out.bonus} = ${out.total ?? out.d20}` : `d20 ${out.d20}`}
                          style={{
                            fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800,
                            padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(167,139,250,0.15)',
                            border: '1px solid rgba(167,139,250,0.4)',
                            color: '#a78bfa',
                          }}
                        >
                          {out.bonus !== undefined && out.total !== undefined
                            ? `${out.d20}${out.bonus >= 0 ? '+' : ''}${out.bonus}=${out.total}`
                            : `d20: ${out.d20}`}
                        </span>
                      )}
                      <span style={{
                        fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
                        letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                        padding: '2px 7px', borderRadius: 999,
                        ...(out?.outcome === 'passed' ? {
                          background: 'rgba(74,222,128,0.15)',
                          border: '1px solid rgba(74,222,128,0.5)', color: '#4ade80',
                        } : out?.outcome === 'failed' ? {
                          background: 'rgba(239,68,68,0.15)',
                          border: '1px solid rgba(239,68,68,0.5)', color: '#f87171',
                        } : out?.outcome === 'auto-failed' ? {
                          background: 'rgba(168,85,247,0.15)',
                          border: '1px solid rgba(168,85,247,0.5)', color: '#a855f7',
                        } : {
                          background: 'transparent',
                          border: '1px solid var(--c-border)', color: 'var(--t-3)',
                        }),
                      }}>
                        {out?.outcome === 'auto-failed' ? 'WILLING' :
                         out?.outcome === 'pending' ? 'Pending' :
                         out?.outcome ?? 'Pending'}
                      </span>
                    </div>
                    {/* v2.249.0 — Row 2: bonus indicator + editable input.
                        Hidden when the bonus hasn't loaded yet (initial
                        async fetch); shows a "?" badge for low-confidence
                        rows so the DM knows the value isn't from full
                        ability data and they may want to override. The
                        manual-override input lets them tweak before
                        rolling — useful for buff stacks we don't track
                        (Bardic Inspiration, Bless if it's already been
                        rolled separately, etc.). */}
                    {(() => {
                      const sb = saveBonuses[p.id];
                      if (!sb) return null;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.06em' }}>
                            {ability.save?.ability} bonus:
                          </span>
                          <input
                            disabled={checking}
                            type="number"
                            value={sb.bonus}
                            onChange={e => {
                              const v = parseInt(e.target.value, 10);
                              if (Number.isFinite(v)) setBonusOverride(p.id, v);
                            }}
                            title={sb.breakdown}
                            style={{
                              width: 56, padding: '2px 6px',
                              fontSize: 11, fontFamily: 'var(--ff-stat)', fontWeight: 700,
                              background: 'var(--c-card)',
                              border: `1px solid ${sb.confidence === 'low' ? 'rgba(251,191,36,0.5)' : 'var(--c-border)'}`,
                              borderRadius: 4,
                              color: 'var(--t-1)',
                              textAlign: 'center' as const,
                            }}
                          />
                          {sb.confidence === 'low' && (
                            <span
                              title={`Low confidence: ${sb.breakdown}. Override the value if you know the target's actual ${ability.save?.ability} save bonus.`}
                              style={{
                                fontSize: 9, fontWeight: 800,
                                padding: '1px 5px', borderRadius: 999,
                                background: 'rgba(251,191,36,0.15)',
                                border: '1px solid rgba(251,191,36,0.5)',
                                color: '#fbbf24',
                                letterSpacing: '0.06em',
                              }}
                            >
                              ?
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {out?.automaticFailure&&<div style={{fontSize:11,color:'#f87171',marginBottom:6}}>Automatic failure from condition — no dice rolled</div>}
                    {out?.disadvantage&&!out.advantage&&<div style={{fontSize:11,color:'#c4b5fd',marginBottom:6}}>Disadvantage: {out.rolls?.join(' or ')} — keep lowest</div>}
                    {out?.advantage&&!out.disadvantage&&<div style={{fontSize:11,color:'#c4b5fd',marginBottom:6}}>Psionic Guards: {out.rolls?.join(' or ')} — keep highest</div>}
                    {/* Row 3: action buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => rollForTarget(p)}
                        disabled={checking||!saveBonuses[p.id]}
                        title={saveBonuses[p.id]?.naturalExtremes ? 'Roll against DC using this target’s natural 1/20 house rule.' : 'Roll d20 + the bonus shown against DC. Natural 1 and 20 do not override the total.'}
                        style={btnStyle('#60a5fa')}
                      >
                        Roll Save
                      </button>
                      <button
                        disabled={checking}
                        onClick={() => setOutcome(p.id, 'passed', out?.d20, out?.total, out?.bonus,out?.rolls,out?.advantage,out?.naturalExtremes,out?.disadvantage,out?.automaticFailure)}
                        style={btnStyle('#4ade80', out?.outcome === 'passed')}
                      >
                        Mark Pass
                      </button>
                      <button
                        disabled={checking}
                        onClick={() => setOutcome(p.id, 'failed', out?.d20, out?.total, out?.bonus,out?.rolls,out?.advantage,out?.naturalExtremes,out?.disadvantage,out?.automaticFailure)}
                        style={btnStyle('#f87171', out?.outcome === 'failed')}
                      >
                        Mark Fail
                      </button>
                      {showAutoFail && (
                        <button
                          disabled={checking}
                          onClick={() => autoFail(p)}
                          title="The target voluntarily fails the save (PHB 2024 p.235)."
                          style={btnStyle('#a855f7', out?.outcome === 'auto-failed')}
                        >
                          Auto-Fail (willing)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
            {targets.length === 0 ? '' :
              allResolved ? 'All targets resolved.' :
              `${targets.filter(t => outcomes[t.id]?.outcome !== 'pending').length} of ${targets.length} resolved.`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                fontSize: 12, fontWeight: 700, padding: '8px 14px',
                background: 'transparent', color: 'var(--t-2)',
                border: '1px solid var(--c-border)', borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={checking||(singleTarget?!allResolved:targets.length > 0 && !allResolved)}
              style={{
                fontSize: 13, fontWeight: 800, padding: '8px 18px',
                background: '#a78bfa', color: '#fff',
                border: '1px solid #a78bfa', borderRadius: 6,
                cursor: 'pointer',
                opacity: (targets.length > 0 && !allResolved) ? 0.5 : 1,
              }}
            >
              {targets.length === 0 ? 'Use anyway' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function btnStyle(color: string, active = false): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, padding: '4px 10px',
    borderRadius: 4, cursor: 'pointer',
    background: active ? `${color}33` : 'transparent',
    color, border: `1px solid ${color}66`,
  };
}

/**
 * v2.247 — convenience formatter used by the parent's log entry.
 * Returns a one-line human summary like:
 *   "Telekinesis · DC 15 STR · Goblin 1: failed (d20=7+0=7) · Goblin 2: passed (d20=15+2=17) · Vex: willing"
 *
 * v2.249.0 — when the outcome carries a numeric total, the line shows
 * d20+bonus=total. Falls back to the v2.247 d20-only format for
 * outcomes recorded via Mark Pass/Mark Fail before any roll happened.
 */
export function formatOutcomesLog_DEPRECATED_INLINE(): never {
  throw new Error('formatOutcomesLog moved to src/lib/classAbilityOutcomes.ts');
}
// (The actual function is re-exported at the top of this file from the
// new module; this stub exists only to avoid line-number drift in any
// stack-trace breadcrumbs left around from earlier sessions.)

// Re-export logAction for the parent so it doesn't need a separate import
// path just to log after onConfirmed.
export { logAction };
