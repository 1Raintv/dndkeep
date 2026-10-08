import {useEffect,useRef,useState} from 'react';
import type {PendingAttack} from '../../types';
import {psychicDamageRoll} from '../../rules/psychicDamageRoll';
import {applyPsionicDamagePlan,previewPsionicDamage,type PsionicDamageChoice,type PsionicDamagePlan} from '../../lib/api/psionicDamageResolution';
interface Props {attack:PendingAttack;disabled:boolean;runAction:(action:()=>Promise<unknown>)=>Promise<void>;onCancel:()=>unknown}
/** v2.849: choices change a server preview; no turn use is spent until Apply commits. */
export default function PsionicDamageResolutionPanel({attack,disabled,runAction,onCancel}:Props){
 const [choice,setChoice]=useState<PsionicDamageChoice>({}),[plan,setPlan]=useState<PsionicDamagePlan|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const sequence=useRef(0),dice=psychicDamageRoll(attack);
 useEffect(()=>{
  const n=++sequence.current;let live=true;setLoading(true);setError('');
  previewPsionicDamage(attack.id,choice).then(p=>{if(live&&n===sequence.current)setPlan(p);},e=>{if(live&&n===sequence.current){setError(e instanceof Error?e.message:'Damage preview unavailable');}})
   .finally(()=>{if(live&&n===sequence.current)setLoading(false);});
  return()=>{live=false;};
 },[attack.id,attack.damage_final,choice,revision]);
 const locked=disabled||loading;
 return <section aria-label="Psychic damage resolution" style={{display:'grid',gap:10,minWidth:0,overflowWrap:'anywhere'}}>
  <div>{dice?.expression} · [{dice?.rolls.join(', ')}]</div>
  {dice?.rolls.some((n,i)=>n!==dice.originalRolls[i])&&<div>Surge adjusted low dice to 4.</div>}
  {attack.attack_kind==='save'&&attack.save_result==='passed'&&<div>Successful save: {attack.save_success_effect==='half'?'half damage; replacement applies before halving.':'no damage.'}</div>}
  <label>Damage before defenses <input aria-label="Damage before defenses" type="number" min={0} max={2147483647} step={1} disabled={disabled}
   value={choice.amount??attack.damage_final??0} onChange={e=>{const amount=Number(e.target.value);if(Number.isSafeInteger(amount)&&amount>=0&&amount<=2147483647)setChoice(c=>({...c,amount}));}} style={{width:90,maxWidth:'100%',marginLeft:8}} /></label>
  <label>Psychic defenses <select aria-label="Psychic defenses" disabled={disabled} value={choice.affinity??''}
   onChange={e=>setChoice(c=>({...c,affinity:(e.target.value||undefined) as PsionicDamageChoice['affinity']}))} style={{display:'block',width:'100%',marginTop:4}}>
   <option value="">Use recorded defenses</option><option value="normal">No Psychic defense</option><option value="resistant">Resistant</option>
   <option value="immune">Immune</option><option value="vulnerable">Vulnerable</option><option value="resistant-vulnerable">Resistant and vulnerable</option>
  </select></label>
  {plan&&!plan.defensesKnown&&!choice.affinity&&<p role="status">Check the target’s conditional or missing defenses, then choose how Psychic damage applies.</p>}
  {plan?.pendingActivation&&<p role="status">Finish the saved Sharpened Mind roll on the character sheet to make it available for die replacement.</p>}
  {plan?.bypass&&<div>Sharpened Mind ignores Psychic resistance. Immunity still applies.</div>}
  {plan?.immune&&<div>Psychic immunity prevents this damage.</div>}
  {plan?.resistant&&!plan.bypass&&!plan.immune&&<div>Psychic resistance halves the damage.</div>}
  {plan?.vulnerable&&!plan.immune&&<div>Psychic vulnerability doubles the damage after resistance.</div>}
  {plan?.usedThisTurn&&<div>Sharpened die replacement already used this turn.</div>}
  {!!(plan?.activations.length||choice.activationId)&&<>
   <label>Sharpened Mind <select aria-label="Sharpened Mind replacement" disabled={locked||!!plan?.usedThisTurn||!!plan?.immune} value={choice.activationId??''}
    onChange={e=>setChoice(c=>({...c,activationId:e.target.value||undefined,dieIndex:e.target.value?0:undefined}))} style={{display:'block',width:'100%',marginTop:4}}>
    <option value="">Keep the rolled dice</option>{plan?.activations.map(a=><option key={a.id} value={a.id}>Replace one die with {a.total}</option>)}
   </select></label>
   {choice.activationId&&<label>Damage die <select aria-label="Damage die to replace" disabled={locked} value={choice.dieIndex??0}
    onChange={e=>setChoice(c=>({...c,dieIndex:Number(e.target.value)}))} style={{marginLeft:8}}>
    {dice?.rolls.map((value,index)=><option key={index} value={index}>Die {index+1}: {value}</option>)}
   </select></label>}
  </>}
  {loading?<div role="status">Checking damage…</div>:plan?.damageAfter!=null&&<strong>Final Psychic damage: {plan.damageAfter}</strong>}
  {plan?.replacement&&<div>Die {plan.replacement.dieIndex+1}: {plan.replacement.original} → {plan.replacement.replacement}. Uses this turn’s replacement when damage applies.</div>}
  {error&&<div role="alert">{error}</div>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
   <button disabled={disabled} onClick={()=>{setChoice(c=>({...c,activationId:undefined,dieIndex:undefined}));setRevision(n=>n+1);}}>Refresh damage</button>
   <button disabled={disabled} onClick={onCancel}>Cancel</button>
   <button className="btn-gold" disabled={locked||!plan||plan.damageAfter===null||!!error} onClick={()=>{if(plan)void runAction(()=>applyPsionicDamagePlan(plan));}}>✶ Apply Damage</button>
  </div>
 </section>;
}
