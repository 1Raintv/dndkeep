import {readDamageComponents} from '../../rules/damageComponents';
import {isNetworkError} from '../../lib/authErrors';
import {useToast} from '../shared/Toast';
// v2.97.0 — Phase E of the Combat Backbone
//
// Auto-opens for the DM whenever a pending_attack exists in non-terminal state
// (declared / attack_rolled / damage_rolled). Walks through the state machine
// with one button per step. Fudge edit + cancel available.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  rollAttackRoll, rollDamage, applyDamage, cancelAttack, fudgeDamage,
  rollSave, getTargetSaveBonus,
} from '../../lib/pendingAttack';
import type { PendingAttack, PendingReaction } from '../../types';

interface Props {
  campaignId: string;
  isDM: boolean;
}

export default function AttackResolutionModal(props: Props) {
  // v2.840: a campaign/role change retires all in-flight dialog callbacks.
  return <AttackResolutionContent key={`${props.campaignId}:${props.isDM}`} {...props} />;
}
function AttackResolutionContent({ campaignId, isDM }: Props) {
  const {showToast}=useToast();
  const [atk, setAtk] = useState<PendingAttack | null>(null);
  const [reactions, setReactions] = useState<PendingReaction[]>([]);
  const [loading, setLoading] = useState(false);
  const busy=useRef(false),alive=useRef(true),loadSequence=useRef(0);
  const [actionError,setActionError]=useState('');
  const [loadError,setLoadError]=useState('');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;loadSequence.current++;};},[]);
  const [fudgeValue, setFudgeValue] = useState<string>('');
  // v2.104.0 — Phase F: AoE sibling progress indicator
  const [groupProgress, setGroupProgress] = useState<{ remaining: number; total: number } | null>(null);
  // v2.102.0 — Phase F pt 3a: save-prompt state. Editable bonus (auto-fetched
  // for character targets, manual for monsters/NPCs) and the breakdown string
  // that explains where the number came from.
  const [saveBonus, setSaveBonus] = useState<string>('0');
  const [saveBonusBreakdown, setSaveBonusBreakdown] = useState<string>('');

  async function load() {
    const sequence=++loadSequence.current;
    const current=()=>alive.current&&sequence===loadSequence.current;
    try {
      const {data,error}=await supabase.from('pending_attacks').select('*')
        .eq('campaign_id',campaignId).in('state',['declared','attack_rolled','damage_rolled'])
        .order('declared_at',{ascending:false}).limit(1).maybeSingle();
      if(error)throw error;
      const next=(data as PendingAttack)??null;
      let offers:PendingReaction[]=[],progress:{remaining:number;total:number}|null=null;
      if(next){
        const {data:rdata,error:reactionError}=await supabase.from('pending_reactions').select('*')
          .eq('pending_attack_id',next.id).order('offered_at',{ascending:false});
        if(reactionError)throw reactionError;
        offers=(rdata??[]) as PendingReaction[];
        if(next.damage_group_id){
          const [total,remaining]=await Promise.all([
            supabase.from('pending_attacks').select('*',{count:'exact',head:true}).eq('damage_group_id',next.damage_group_id),
            supabase.from('pending_attacks').select('*',{count:'exact',head:true}).eq('damage_group_id',next.damage_group_id).in('state',['declared','attack_rolled','damage_rolled']),
          ]);
          if(total.error)throw total.error;if(remaining.error)throw remaining.error;
          progress={remaining:remaining.count??0,total:total.count??0};
        }
      }
      // Publish attack and reactions together; a failed reaction read must not
      // masquerade as no reactions and unlock Apply Damage.
      if(current()){setAtk(next);setReactions(offers);setGroupProgress(progress);setLoadError('');}
    } catch {
      if(current())setLoadError('Combat state could not be refreshed. Refresh before continuing.');
    }
  }

  // v2.840: serialize even same-frame clicks, report failures, and reload the
  // committed state after either outcome. Never automatically repeat a write.
  async function runAction(action:()=>Promise<unknown>) {
    if(!alive.current||busy.current||loadError)return;
    busy.current=true;setLoading(true);setActionError('');
    try {await action();}
    catch(error){if(alive.current){
      const message=isNetworkError(error instanceof Error?error:null)?'The response was interrupted. The action may already be saved; review the refreshed combat state.':error instanceof Error?error.message:'Combat action could not be confirmed. Refresh its saved state before continuing.';
      setActionError(message);showToast(message,'error');
    }}
    finally {if(alive.current){await load();if(alive.current){busy.current=false;setLoading(false);}}}
  }

  // Subscribe to realtime so any change (including another client's declare)
  // opens or updates this modal.
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`pending-attack:${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_attacks',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_reactions',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Seed the fudge input whenever damage is rolled
  useEffect(() => {
    if (atk?.state === 'damage_rolled' && atk.damage_final != null) {
      setFudgeValue(String(atk.damage_final));
    }
  }, [atk?.id, atk?.state, atk?.damage_final]);

  // v2.102.0 — Phase F pt 3a: auto-fetch the target's save bonus when a
  // save-kind attack is in flight. Skips if save already rolled.
  useEffect(() => {
    if (!atk) return;
    if (atk.attack_kind !== 'save') return;
    if (atk.save_result) return;
    if (!atk.target_participant_id || !atk.save_ability) return;
    let canceled = false;
    getTargetSaveBonus(atk.target_participant_id, atk.save_ability).then(r => {
      if (canceled) return;
      setSaveBonus(String(r.bonus));
      setSaveBonusBreakdown(r.breakdown);
    });
    return () => { canceled = true; };
  }, [atk?.id, atk?.attack_kind, atk?.save_result, atk?.target_participant_id, atk?.save_ability]);

  const visibleToPlayer = useMemo(() => {
    if (isDM) return true;
    // Phase E v2.97: players see the modal only when they are the attacker or target.
    // For simplicity in v1 we just show the DM modal. v2.98 will add player-facing UI.
    return false;
  }, [isDM]);

  if (!atk) return visibleToPlayer&&loadError?<div role="alert" style={{position:'fixed',bottom:90,left:16,right:16,zIndex:20002,padding:12,background:'var(--c-card)',color:'var(--t-1)',border:'1px solid #f87171',borderRadius:10}}>{loadError} <button onClick={()=>void load()}>Refresh combat</button></div>:null;
  if (!visibleToPlayer) return null;

  const onRollAttack=()=>runAction(()=>rollAttackRoll(atk.id));
  const onRollSave=()=>runAction(()=>rollSave(atk.id,parseInt(saveBonus,10)||0));
  const onRollDamage=()=>runAction(()=>rollDamage(atk.id));
  const onApply=()=>{if(reactions.some(r=>r.state==='offered'))return;return runAction(async()=>{
    const typed=parseInt(fudgeValue,10);
    if(Number.isFinite(typed)&&typed!==atk.damage_final)await fudgeDamage(atk.id,typed);
    await applyDamage(atk.id);
  });};
  const onCancel=()=>runAction(()=>cancelAttack(atk.id));
  const controlsDisabled=loading||!!loadError;

  const recordedBase=readDamageComponents(atk.damage_components)?.components.find(c=>c.source==='base');
  const isAttackRoll = atk.attack_kind === 'attack_roll';
  const isSaveBased  = atk.attack_kind === 'save';
  const isAutoHit    = atk.attack_kind === 'auto_hit';

  const outstandingOffers = reactions.filter(r => r.state === 'offered');
  const isWaitingForReactions = outstandingOffers.length > 0;
  const acceptedReactions = reactions.filter(r => r.state === 'accepted');

  // Summary chips
  const chips: Array<{ label: string; color: string; value: string }> = [];
  if (isAttackRoll && atk.attack_bonus != null) {
    chips.push({ label: 'Atk', color: '#fbbf24', value: `${atk.attack_bonus >= 0 ? '+' : ''}${atk.attack_bonus}` });
  }
  if (isAttackRoll && atk.target_ac != null) {
    chips.push({ label: 'vs AC', color: '#60a5fa', value: String(atk.target_ac) });
  }
  if (isSaveBased && atk.save_dc != null) {
    chips.push({ label: 'DC', color: '#a78bfa', value: `${atk.save_ability} ${atk.save_dc}` });
  }
  if (atk.damage_dice) {
    chips.push({ label: 'Dmg', color: '#f87171', value: `${atk.damage_dice} ${atk.damage_type ?? ''}`.trim() });
  }
  // v2.103.0 — Phase F: cover chip
  if (atk.cover_level && atk.cover_level !== 'none') {
    const coverLabel = atk.cover_level === 'half' ? 'Half cover' : atk.cover_level === 'three_quarters' ? '¾ cover' : 'Total cover';
    const coverColor = atk.cover_level === 'total' ? '#f87171' : atk.cover_level === 'three_quarters' ? '#a78bfa' : '#60a5fa';
    chips.push({ label: 'Cover', color: coverColor, value: coverLabel });
  }
  // v2.104.0 — Phase F: AoE progress chip
  if (groupProgress && groupProgress.total > 1) {
    const done = groupProgress.total - groupProgress.remaining + 1;
    chips.push({ label: 'AoE', color: '#a78bfa', value: `Target ${done} of ${groupProgress.total}` });
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 20002, padding: 20, paddingBottom: 90,  // clear of initiative strip
        pointerEvents: 'none',
      }}
    >
      <div role="region" aria-label="Resolve attack"
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '1px solid var(--c-gold-bdr)',
          maxWidth: 620, width: '100%', maxHeight:'calc(100dvh - 110px)', overflowY:'auto',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(139,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 14, fontWeight: 800 }}>
              ⚔ {atk.attacker_name}
            </span>
            <span style={{ color: 'var(--t-2)', fontSize: 12 }}>attacks</span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 14, fontWeight: 800, color: 'var(--c-gold-l)' }}>
              {atk.target_name}
            </span>
            <span style={{ color: 'var(--t-3)', fontSize: 11 }}>· {atk.attack_name}</span>
          </div>
          <button onClick={onCancel} disabled={controlsDisabled} style={{ fontSize: 10, padding: '3px 8px', minHeight: 0, color: '#f87171' }}>
            Cancel
          </button>
        </div>

        {(actionError||loadError)&&<div role="alert" style={{padding:'10px 18px',color:'#fca5a5',fontSize:12,overflowWrap:'anywhere'}}>
          {actionError&&<div>{actionError}</div>}{loadError&&<div>{loadError}</div>}
          <button onClick={()=>void load()} disabled={loading} style={{marginTop:6}}>Refresh combat</button>
        </div>}
        {/* Summary chips */}
        <div style={{
          padding: '10px 18px 0',
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {chips.map(c => (
            <span key={c.label} style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 999,
              color: c.color,
              background: `${c.color}1a`,
              border: `1px solid ${c.color}40`,
            }}>
              {c.label}: <strong>{c.value}</strong>
            </span>
          ))}
        </div>

        {/* State-specific content */}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Declared: show roll-attack button (or skip to damage if auto_hit/save) */}
          {atk.state === 'declared' && (
            <>
              {isAttackRoll && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--t-2)', fontSize: 13 }}>Ready to roll the attack.</span>
                  <button className="btn-gold" onClick={onRollAttack} disabled={controlsDisabled} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                    ⚄ Roll Attack
                  </button>
                </div>
              )}
              {isAutoHit && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--t-2)', fontSize: 13 }}>Auto-hit — roll damage.</span>
                  <button className="btn-gold" onClick={onRollDamage} disabled={controlsDisabled} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                    ⚄ Roll Damage
                  </button>
                </div>
              )}
              {/* v2.102.0 — Phase F pt 3a: save-based attacks roll the save
                  FIRST, then damage. save_result gates half/zero/full in
                  rollDamage. */}
              {isSaveBased && !atk.save_result && (
                <>
                  <div style={{
                    padding: 12, borderRadius: 8,
                    background: 'rgba(167,139,250,0.08)',
                    border: '1px solid rgba(167,139,250,0.3)',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: 4 }}>
                        Target Save · {atk.save_ability} DC {atk.save_dc}
                      </div>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
                        {atk.target_name}
                        {saveBonusBreakdown && (
                          <span style={{ color: 'var(--t-3)', marginLeft: 8 }}>· {saveBonusBreakdown}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)' }}>
                        Bonus
                      </label>
                      <input
                        type="number"
                        value={saveBonus}
                        onChange={e => setSaveBonus(e.target.value)}
                        style={{
                          width: 56, fontSize: 16, fontWeight: 800,
                          fontFamily: 'var(--ff-stat)', textAlign: 'center',
                          minHeight: 0, padding: '4px 6px',
                        }}
                      />
                      <button
                        className="btn-gold"
                        onClick={onRollSave}
                        disabled={controlsDisabled}
                        style={{ fontSize: 12, fontWeight: 800, padding: '6px 14px' }}
                      >
                        ⚄ Roll Save
                      </button>
                    </div>
                  </div>
                </>
              )}
              {/* Save already rolled — show result + Roll Damage */}
              {isSaveBased && atk.save_result && (
                <>
                  <SaveBanner atk={atk} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-gold" onClick={onRollDamage} disabled={controlsDisabled} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                      ⚄ Roll Damage
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Attack rolled: show d20 + total, hit/miss/crit, then offer roll damage or close */}
          {atk.state === 'attack_rolled' && (
            <>
              <HitBanner atk={atk} />

              {acceptedReactions.length > 0 && (
                <div style={{
                  padding: 10, borderRadius: 8,
                  background: 'rgba(96,165,250,0.1)',
                  border: '1px solid rgba(96,165,250,0.4)',
                  fontFamily: 'var(--ff-body)', fontSize: 12, color: '#60a5fa',
                }}>
                  ↯ Reactions used: {acceptedReactions.map(r => `${r.reactor_name} cast ${r.reaction_name}`).join(', ')}
                </div>
              )}

              {isWaitingForReactions ? (
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: '#fbbf24' }}>
                    ⏳ Waiting on reactions: {outstandingOffers.map(o => `${o.reactor_name} (${o.reaction_name})`).join(', ')}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--t-3)' }}>Up to 120s</span>
                </div>
              ) : (atk.hit_result === 'hit' || atk.hit_result === 'crit') && atk.damage_dice ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-gold" onClick={onRollDamage} disabled={controlsDisabled} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                    ⚄ Roll Damage
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={onRollDamage} disabled={controlsDisabled} style={{ fontSize: 12, padding: '6px 14px' }}>
                    Skip & Close
                  </button>
                </div>
              )}
            </>
          )}

          {/* Damage rolled: show total, let DM edit (fudge), then Apply */}
          {atk.state === 'damage_rolled' && (
            <>
              {isWaitingForReactions&&<div role="status" style={{fontSize:12,color:'var(--c-gold-l)',overflowWrap:'anywhere'}}>
                Waiting on reactions: {outstandingOffers.map(o=>`${o.reactor_name} (${o.reaction_name})`).join(', ')}
              </div>}
              <div style={{
                padding: 12, borderRadius: 8,
                background: '#0d1117', border: '1px solid var(--c-border)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 4 }}>
                    Damage
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
                    {recordedBase?.expression??atk.damage_dice} {atk.damage_type ?? ''}
                    {atk.damage_rolls && atk.damage_rolls.length > 0 && (
                      <span style={{ color: 'var(--t-3)', marginLeft: 8 }}>
                        [{atk.damage_rolls.join(', ')}]
                      </span>
                    )}
                    {atk.hit_result === 'crit' && <span style={{ color: 'var(--c-gold-l)', marginLeft: 8, fontWeight: 700 }}>CRIT</span>}
                    {atk.psionic_damage_dice&&recordedBase?.dieKinds.includes('adjusted')&&<div style={{fontSize:10,marginTop:4}}>Surge adjusted low dice to 4.</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)' }}>
                    Final
                  </label>
                  <input
                    type="number"
                    value={fudgeValue}
                    onChange={e => setFudgeValue(e.target.value)}
                    style={{
                      width: 80, fontSize: 20, fontWeight: 900,
                      fontFamily: 'var(--ff-stat)', textAlign: 'center',
                      minHeight: 0, padding: '4px 8px',
                      color: parseInt(fudgeValue, 10) !== atk.damage_final ? '#fde68a' : 'var(--t-1)',
                    }}
                  />
                </div>
              </div>
              {parseInt(fudgeValue, 10) !== atk.damage_final && (
                <div style={{ fontSize: 10, color: '#fde68a', fontStyle: 'italic', textAlign: 'right' }}>
                  Fudged: {atk.damage_final} → {fudgeValue} (logged privately to DM only)
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onCancel} disabled={controlsDisabled} style={{ fontSize: 12, padding: '6px 14px' }}>Cancel</button>
                <button className="btn-gold" onClick={onApply} disabled={controlsDisabled||isWaitingForReactions} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                  ✶ Apply Damage
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function HitBanner({ atk }: { atk: PendingAttack }) {
  const hit = atk.hit_result;
  const colors: Record<string, string> = {
    hit: '#34d399', miss: '#94a3b8', crit: '#fde68a', fumble: '#f87171',
  };
  const color = hit ? colors[hit] : 'var(--t-2)';
  const label = hit ? hit.toUpperCase() : '?';
  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: `${color}14`, border: `1px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
        Rolled {atk.attack_d20} + {atk.attack_bonus ?? 0} = <strong style={{ color: 'var(--t-1)' }}>{atk.attack_total}</strong>
        {atk.target_ac != null && ` vs AC ${atk.target_ac}`}
      </div>
      <span style={{
        fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 900,
        letterSpacing: '0.08em',
        padding: '3px 12px', borderRadius: 5,
        color, background: `${color}22`, border: `1px solid ${color}50`,
      }}>
        {label}
      </span>
    </div>
  );
}

function SaveBanner({ atk }: { atk: PendingAttack }) {
  const saved = atk.save_result === 'passed';
  const color = saved ? '#34d399' : '#f87171';
  const label = saved ? 'SAVED' : 'FAILED';
  const effectCopy = saved
    ? (atk.save_success_effect === 'none' ? 'No damage' : atk.save_success_effect === 'half' ? 'Half damage' : 'Alternate effect')
    : 'Full damage';
  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: `${color}14`, border: `1px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
        {atk.target_name} rolled {atk.save_d20} + {((atk.save_total ?? 0) - (atk.save_d20 ?? 0))} = <strong style={{ color: 'var(--t-1)' }}>{atk.save_total}</strong> vs DC {atk.save_dc}
        <span style={{ color: 'var(--t-3)', marginLeft: 8 }}>→ {effectCopy}</span>
      </div>
      <span style={{
        fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 900,
        letterSpacing: '0.08em',
        padding: '3px 12px', borderRadius: 5,
        color, background: `${color}22`, border: `1px solid ${color}50`,
      }}>
        {label}
      </span>
    </div>
  );
}
