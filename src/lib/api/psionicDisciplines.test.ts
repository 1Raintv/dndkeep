import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
import {createDisciplineRequest} from '../psionicDisciplineRequest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {beginPsionicDiscipline,finishPsionicDiscipline,getPsionicDisciplineTurn,getPsionicGuardsSaveAdvantage} from './psionicDisciplines';
const hero={id:'hero',class_name:'Psion',level:5,intelligence:18,inventory:[],class_resources:{'psionic-energy-dice':6,'psion-disciplines':['biofeedback','inerrant-aim']},feature_uses:{},psionic_energy_revision:0} as unknown as Character;
const request=createDisciplineRequest(hero,{soloTurn:0},'biofeedback',[3,4],2,4,'saved');
const energy={requestId:'saved',remaining:4,energyRevision:1,restorationResource:null,restorationUsed:null,rolls:[3,4],replayed:false};
const receipt={requestId:'saved',turn:{soloTurn:0},discipline:'biofeedback',sourceFeature:'Biofeedback',rolls:[3,4],count:2,conditional:false,energy,outcome:{spent:true},replayed:false,character:{...hero,psionic_energy_revision:1,class_resources:{...hero.class_resources,'psionic-energy-dice':4}}};
const conditional=createDisciplineRequest(hero,{soloTurn:0},'inerrant-aim',[3],1,4,'bonus');
const bonus={requestId:'bonus',turn:{soloTurn:0},discipline:'inerrant-aim',sourceFeature:'Inerrant Aim',rolls:[3],count:1,conditional:true,energy:null,outcome:null,replayed:false,character:hero};
beforeEach(()=>vi.resetAllMocks());afterEach(()=>vi.useRealTimers());
it('freezes the original identity, rolls and expected snapshot across a lost-response retry',async()=>{
 const r=structuredClone(request);
 mocks.rpc.mockImplementationOnce(async()=>{r.rolls[0]=8;r.turn={soloTurn:4};r.expected.intelligence=20;throw new Error('lost');})
  .mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
 expect(await beginPsionicDiscipline('hero',r)).toMatchObject({replayed:true,rolls:[3,4]});
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['begin_psionic_discipline',{p_character_id:'hero',p_request_id:'saved',p_turn:{soloTurn:0},p_discipline:'biofeedback',p_rolls:[3,4],p_count:2,p_modifier:4,p_expected:request.expected}]);
});
it('accepts current resources that differ from the historical payment',async()=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,replayed:true,character:{...receipt.character,psionic_energy_revision:7,class_resources:{'psionic-energy-dice':1}}},error:null});
 const result=await beginPsionicDiscipline('hero',request);
 expect(result.energy?.remaining).toBe(4);expect(result.character.class_resources?.['psionic-energy-dice']).toBe(1);
});
it.each([{requestId:'other'},{rolls:[4,4]},{count:1},{conditional:true},{sourceFeature:'Other'},{turn:{soloTurn:1}},{outcome:null},{energy:null},{energy:{...energy,energyRevision:-1}},{character:{...receipt.character,psionic_energy_revision:0}},{character:{...receipt.character,id:'other'}},{character:{...receipt.character,class_resources:[]}}])('retains recovery on unverifiable success %j',async patch=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,...patch},error:null});
 await expect(beginPsionicDiscipline('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('accepts a persisted conditional attempt before any cost',async()=>{
 mocks.rpc.mockResolvedValue({data:bonus,error:null});expect(await beginPsionicDiscipline('hero',conditional)).toMatchObject({outcome:null,energy:null});
});
it('finish keeps the original boolean decision even if the caller mutates it during retry',async()=>{
 const r={...conditional,changedOutcome:false};
 mocks.rpc.mockImplementationOnce(async()=>{r.changedOutcome=true;throw new Error('lost');}).mockResolvedValueOnce({data:{...bonus,outcome:{spent:false,energy:null}},error:null});
 expect(await finishPsionicDiscipline('hero',r)).toMatchObject({outcome:{spent:false}});
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(mocks.rpc.mock.calls[0][1].p_changed_outcome).toBe(false);
});
it('a paid conditional outcome requires matching saved rolls and current resource revision',async()=>{
 const paid={...bonus,outcome:{spent:true,energy:{...energy,requestId:'bonus',rolls:[3],remaining:5}},character:{...hero,psionic_energy_revision:1,class_resources:{'psionic-energy-dice':5}}};
 mocks.rpc.mockResolvedValue({data:paid,error:null});expect(await finishPsionicDiscipline('hero',{...conditional,changedOutcome:true})).toMatchObject({outcome:{spent:true}});
 mocks.rpc.mockResolvedValue({data:{...paid,outcome:{spent:true,energy:{...paid.outcome.energy,rolls:[4]}}},error:null});
 await expect(finishPsionicDiscipline('hero',{...conditional,changedOutcome:true})).rejects.toMatchObject({definitelyNotPaid:false});
});
it.each([null,{spent:true,energy:null},{spent:false,energy:null}])('does not acknowledge a missing or contradictory paid decision %j',async outcome=>{
 mocks.rpc.mockResolvedValue({data:{...bonus,outcome},error:null});
 await expect(finishPsionicDiscipline('hero',{...conditional,changedOutcome:true})).rejects.toMatchObject({definitelyNotPaid:false});
});
it('does not send invalid saved requests',async()=>{
 await expect(beginPsionicDiscipline('hero',{...request,expected:{}})).rejects.toMatchObject({definitelyNotPaid:true});
 await expect(finishPsionicDiscipline('hero',{...request,changedOutcome:true})).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not retry a definitive rule rejection',async()=>{
 mocks.rpc.mockResolvedValue({error:{message:'Already used',code:'P0001'},data:null});
 await expect(beginPsionicDiscipline('hero',request)).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('times out with the saved attempt still uncertain and no automatic new request',async()=>{
 vi.useFakeTimers();mocks.rpc.mockReturnValue(new Promise(()=>{}));
 const pending=expect(beginPsionicDiscipline('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});
 await vi.advanceTimersByTimeAsync(15000);await pending;expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('loads current uses and unresolved earlier turns without rerolling',async()=>{
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:1},uses:[],pending:[bonus]},error:null});
 expect(await getPsionicDisciplineTurn('hero')).toMatchObject({turn:{soloTurn:1},pending:[{requestId:'bonus',rolls:[3]}]});
});
it.each([
 {turn:{soloTurn:1},uses:[receipt],pending:[]},
 {turn:{soloTurn:0},uses:[receipt,receipt],pending:[]},
 {turn:{soloTurn:0},uses:[],pending:[receipt]},
 {turn:{soloTurn:0},uses:[],pending:[bonus,bonus]},
 {turn:{soloTurn:0},uses:[],pending:[{...bonus,outcome:{spent:false,energy:null}}]},
 {turn:{soloTurn:0},uses:null,pending:[]},
])('rejects inconsistent turn-state responses %j',async data=>{
 mocks.rpc.mockResolvedValue({data,error:null});await expect(getPsionicDisciplineTurn('hero')).rejects.toMatchObject({definitelyNotPaid:false});
});

it.each([
 {turn:{soloTurn:0},uses:[],pending:[bonus]},
 {turn:{soloTurn:0},uses:[bonus],pending:[]},
 {turn:{soloTurn:0},uses:[bonus],pending:[{...bonus,rolls:[4]}]},
])('rejects conflicting unresolved claims between the two server lists %j',async data=>{
 mocks.rpc.mockResolvedValue({data,error:null});await expect(getPsionicDisciplineTurn('hero')).rejects.toMatchObject({definitelyNotPaid:false});
});
it('accepts the same current pending claim in both lists',async()=>{
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:0},uses:[bonus],pending:[bonus]},error:null});
 expect(await getPsionicDisciplineTurn('hero')).toMatchObject({uses:[{requestId:'bonus'}],pending:[{requestId:'bonus'}]});
});

it('accepts an active Guards identity even after its activation turn',async()=>{
 const guards={requestId:'11111111-1111-4111-8111-111111111111',startToken:'22222222-2222-4222-8222-222222222222'};
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:1},uses:[],pending:[],guards},error:null});
 expect((await getPsionicDisciplineTurn('hero')).guards).toEqual(guards);
});
it.each([{},true,{requestId:'not-an-id',startToken:'bad'},{requestId:'11111111-1111-4111-8111-111111111111'}])('rejects an unverifiable Guards effect %j',async guards=>{
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:0},uses:[],pending:[],guards},error:null});
 await expect(getPsionicDisciplineTurn('hero')).rejects.toMatchObject({definitelyNotPaid:false});
});
it('accepts an explicitly expired Guards effect',async()=>{
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:1},uses:[],pending:[],guards:null},error:null});
 expect((await getPsionicDisciplineTurn('hero')).guards).toBeNull();
});

it('skips Guards lookups for other saves and reads current protection for INT',async()=>{
 expect(await getPsionicGuardsSaveAdvantage('hero','wisdom')).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:0},uses:[],pending:[],guards:{requestId:'11111111-1111-4111-8111-111111111111',startToken:'22222222-2222-4222-8222-222222222222'}},error:null});
 expect(await getPsionicGuardsSaveAdvantage('hero','INT')).toBe(true);
 mocks.rpc.mockResolvedValue({data:{turn:{soloTurn:1},uses:[],pending:[],guards:null},error:null});
 expect(await getPsionicGuardsSaveAdvantage('hero','intelligence')).toBe(false);
});
