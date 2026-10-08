// @vitest-environment happy-dom
import {beforeEach,expect,it} from 'vitest';
import {readPaidPsionicDamage,rememberPaidPsionicDamage,forgetPaidPsionicDamage,psionicDamageEffectContext,paidDamageFromEffect,type PaidPsionicDamage} from './psionicDamageRecovery';
import type {CombatParticipant} from '../types';
const self={id:'self',entity_id:'hero',participant_type:'character',name:'Psion'} as CombatParticipant;
const target={id:'target',entity_id:'goblin',participant_type:'creature',name:'Goblin'} as CombatParticipant;
const result=():PaidPsionicDamage=>({requestId:'paid',characterId:'hero',characterName:'Psion',amount:7,psionicDamageDice:{version:1,sides:8,originalRolls:[3],rolls:[3],modifier:4},targetName:'Goblin',target,context:{campaignId:'camp',encounterId:'enc',self,participants:[self,target]},queued:false});
beforeEach(()=>localStorage.clear());
it('retains final dice, scope and retry identity without saving the rest of the roster',()=>{const r=result();r.context!.participants.push({...target,id:'hidden',name:'Secret'});rememberPaidPsionicDamage(r);const recovered=readPaidPsionicDamage('hero')!;expect(recovered.requestId).toBe('paid');expect(recovered.psionicDamageDice).toEqual(r.psionicDamageDice);expect(recovered.context!.participants).toHaveLength(2);expect(readPaidPsionicDamage('other')).toBeNull();});
it('updates confirmation under the same identity and clears only that identity',()=>{rememberPaidPsionicDamage(result());rememberPaidPsionicDamage({...result(),queued:true});expect(readPaidPsionicDamage('hero')!.queued).toBe(true);expect(()=>forgetPaidPsionicDamage('hero','other')).toThrow(/changed/);forgetPaidPsionicDamage('hero','paid');expect(readPaidPsionicDamage('hero')).toBeNull();});
it('rejects a changed roll under the same request ID',()=>{rememberPaidPsionicDamage(result());expect(()=>rememberPaidPsionicDamage({...result(),amount:8,psionicDamageDice:{...result().psionicDamageDice,rolls:[4],originalRolls:[4]}})).toThrow(/changed/);expect(readPaidPsionicDamage('hero')!.amount).toBe(7);});
it('does not overwrite unresolved damage with a new roll',()=>{rememberPaidPsionicDamage(result());expect(()=>rememberPaidPsionicDamage({...result(),requestId:'second'})).toThrow(/earlier/);});
it('permits a new roll after confirmation, but rejects a late confirmation for the old roll',()=>{rememberPaidPsionicDamage({...result(),queued:true});rememberPaidPsionicDamage({...result(),requestId:'second'});expect(()=>rememberPaidPsionicDamage({...result(),queued:true})).toThrow(/earlier/);expect(readPaidPsionicDamage('hero')!.requestId).toBe('second');});
it.each(['not json','{}'])('blocks malformed storage instead of treating it as unpaid: %s',raw=>{localStorage.setItem('dndkeep:psionic-final-damage:hero',raw);expect(()=>readPaidPsionicDamage('hero')).toThrow(/could not/);});
it('rejects a mismatched total',()=>{expect(()=>rememberPaidPsionicDamage({...result(),amount:99})).toThrow(/could not be saved/);});
it('retains a tabletop result without claiming it was queued',()=>{rememberPaidPsionicDamage({...result(),context:null,target:null});expect(readPaidPsionicDamage('hero')!.context).toBeNull();expect(()=>rememberPaidPsionicDamage({...result(),context:null,target:null,queued:true})).toThrow();});

it('recovers server dice and identity without trusting context-supplied totals or IDs',()=>{
 const r=result(),context={...psionicDamageEffectContext(r.characterName,r.targetName,r.target,r.context),requestId:'forged',amount:99};
 const row={requestId:'server-paid',characterId:'hero',discipline:'destructive-thoughts',context,sides:8,usedSurge:false,baseRolls:[3],enkindledRolls:[],activatedAt:'2026-10-08T00:00:00Z',turn:{soloTurn:0},originalRolls:[3],rolls:[3],modifier:4,total:7} as Parameters<typeof paidDamageFromEffect>[0];
 expect(paidDamageFromEffect(row)).toMatchObject({requestId:'server-paid',effectRollId:'server-paid',amount:7,queued:false,target:{entity_id:'goblin'}});
 expect(()=>paidDamageFromEffect({...row,discipline:'biofeedback'})).toThrow(/target could not/);
});

it('keeps the server effect link across reload and rejects a substituted link',()=>{rememberPaidPsionicDamage({...result(),effectRollId:'paid'});expect(readPaidPsionicDamage('hero')?.effectRollId).toBe('paid');expect(()=>rememberPaidPsionicDamage({...result(),effectRollId:'other'})).toThrow(/could not be saved/);});
