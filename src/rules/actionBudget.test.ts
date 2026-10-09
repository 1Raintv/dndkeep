import {describe,expect,it} from 'vitest';
import {planActionSpend,type ActionBudget,type ActionIntent,type ActionClaim} from './actionBudget';
const budget:ActionBudget={actorId:'psion',turnId:'turn-1',ownerTurnId:'own-1',isOwnTurn:true,canTakeActions:true,canTakeReactions:true,
 grants:[{id:'normal',kind:'action',source:'normal',ownerTurnId:'own-1'},{id:'bonus',kind:'bonusAction',source:'normal',ownerTurnId:'own-1'},
 {id:'reaction',kind:'reaction',source:'normal',ownerTurnId:'own-1'},{id:'surge',kind:'action',source:'action-surge',ownerTurnId:'own-1'},
 {id:'haste',kind:'action',source:'haste',ownerTurnId:'own-1'}],claims:[]};
const intent:ActionIntent={requestId:'propel-1',actorId:'psion',turnId:'turn-1',grantId:'bonus',kind:'bonusAction',purpose:'feature',sourceId:'telekinetic-propel'};
function claim(b=budget,i=intent):ActionClaim{const result=planActionSpend(b,i);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason);return result.claim;}
describe('shared action declarations',()=>{
 it('claims the Bonus Action independently of the later save/energy cost',()=>{
  const first=claim();expect(first).toMatchObject({kind:'bonusAction',sourceId:'telekinetic-propel',ownerTurnId:'own-1'});
  const spent={...budget,claims:[first]};
  expect(planActionSpend(spent,{...intent,requestId:'warp-2',sourceId:'warp-propel'})).toEqual({ok:false,reason:'spent'});
  expect(planActionSpend(spent,intent)).toMatchObject({ok:true,replayed:true,claim:first});
 });
 it('replays after another turn without consuming its fresh budget',()=>{
  const first=claim(),later={...budget,turnId:'turn-2',ownerTurnId:'own-2',claims:[first],grants:budget.grants.map(g=>({...g,ownerTurnId:'own-2'}))};
  expect(planActionSpend(later,intent)).toMatchObject({ok:true,replayed:true,claim:first});
  expect(planActionSpend(later,{...intent,requestId:'propel-2',turnId:'turn-2'})).toMatchObject({ok:true,replayed:false});
 });
 it.each(['actorId','turnId','grantId','kind','purpose','sourceId'] as const)('rejects changed request identity: %s',key=>{
  const changed={...intent,[key]:key==='kind'?'action':key==='purpose'?'magic':'other'};
  expect(planActionSpend({...budget,claims:[claim()]},changed).ok).toBe(false);
 });
 it('rejects ambiguous duplicate records and duplicate grants',()=>{
  const first=claim();expect(planActionSpend({...budget,claims:[first,first]},intent)).toEqual({ok:false,reason:'identity-conflict'});
  expect(planActionSpend({...budget,grants:[...budget.grants,budget.grants[1]]},intent)).toEqual({ok:false,reason:'invalid'});
 });
 it('does not accept a new declaration made against an old turn',()=>{
  expect(planActionSpend({...budget,turnId:'new-turn'},intent)).toEqual({ok:false,reason:'stale-turn'});
 });
 it('does not mutate either input',()=>{
  const before=structuredClone(budget),request=structuredClone(intent);claim();expect(budget).toEqual(before);expect(intent).toEqual(request);
 });
 it.each(['action','bonusAction'] as const)('blocks off-turn %s',kind=>{
  expect(planActionSpend({...budget,isOwnTurn:false},{...intent,kind,grantId:kind==='action'?'normal':'bonus'})).toEqual({ok:false,reason:'wrong-turn'});
 });
 it('allows one reaction across multiple enemy turns, refreshing only on own turn',()=>{
  const reaction={...intent,kind:'reaction' as const,grantId:'reaction',sourceId:'shield'};
  const first=claim({...budget,isOwnTurn:false},reaction);
  expect(planActionSpend({...budget,isOwnTurn:false,turnId:'enemy-2',claims:[first]},{...reaction,requestId:'r2',turnId:'enemy-2'})).toEqual({ok:false,reason:'spent'});
  const next={...budget,turnId:'own-turn-2',ownerTurnId:'own-2',claims:[first],grants:budget.grants.map(g=>({...g,ownerTurnId:'own-2'}))};
  expect(planActionSpend(next,{...reaction,requestId:'r2',turnId:next.turnId})).toMatchObject({ok:true,replayed:false});
 });
 it.each(['action','bonusAction','reaction'] as const)('blocks unavailable %s without consuming a grant',kind=>{
  expect(planActionSpend({...budget,canTakeActions:false,canTakeReactions:false},{...intent,kind})).toEqual({ok:false,reason:'unavailable'});
 });
 it('does not let action grants become extra Bonus Actions',()=>{
  expect(planActionSpend(budget,{...intent,grantId:'surge'})).toEqual({ok:false,reason:'unavailable'});
 });
 it('Action Surge permits an Attack or feature but not the Magic action',()=>{
  for(const purpose of ['attack','feature'] as const)expect(planActionSpend(budget,{...intent,kind:'action',grantId:'surge',purpose})).toMatchObject({ok:true,attackLimit:null});
  expect(planActionSpend(budget,{...intent,kind:'action',grantId:'surge',purpose:'magic'})).toEqual({ok:false,reason:'restricted'});
 });
 it.each(['attack','dash','disengage','hide','utilize'] as const)('Haste permits %s, limiting its Attack to one',purpose=>{
  const request={...intent,kind:'action' as const,grantId:'haste',purpose};const first=claim(budget,request);
  expect(planActionSpend(budget,request)).toMatchObject({ok:true,attackLimit:purpose==='attack'?1:null});
  expect(planActionSpend({...budget,grants:[],claims:[first]},request)).toMatchObject({ok:true,replayed:true,attackLimit:purpose==='attack'?1:null});
 });
 it.each(['magic','dodge','ready','help','feature','influence','search','study'] as const)('Haste cannot pay for %s',purpose=>{
  expect(planActionSpend(budget,{...intent,kind:'action',grantId:'haste',purpose})).toEqual({ok:false,reason:'restricted'});
 });
 it('uses normal actions for Magic and Ready without restricting their later effects',()=>{
  for(const purpose of ['magic','ready'] as const)expect(planActionSpend(budget,{...intent,kind:'action',grantId:'normal',purpose})).toMatchObject({ok:true,attackLimit:null});
 });
});
