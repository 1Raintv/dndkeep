import {createPsionicRestRequest} from '../psionicRestRequest';
import type {Character} from '../../types';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {spendPsionicSurge,completePsionicRest,settlePsionicEnergy,advancePsionicSoloTurn,getEnkindledTurn,spendEnkindledLifeForce} from './psionicTurns';
const request={requestId:'stable',turn:{soloTurn:0},count:2,baseRolls:[1],extraRolls:[2,3],sourceFeature:'Biofeedback'};
beforeEach(()=>vi.resetAllMocks());
afterEach(()=>vi.useRealTimers());
it('replays an ambiguous charge with the identical request and accepts its saved receipt',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'Failed to fetch',code:''}}).mockResolvedValueOnce({data:{requestId:'stable',extraRolls:[2,3],hitDiceSpent:2,hitDiceRevision:1,replayed:true},error:null});
 expect((await spendEnkindledLifeForce('hero',request)).replayed).toBe(true);
 expect(mocks.rpc).toHaveBeenCalledTimes(2);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['spend_enkindled_life_force',{p_character_id:'hero',p_request_id:'stable',p_turn:{soloTurn:0},p_count:2,p_base_rolls:[1],p_extra_rolls:[2,3],p_source_feature:'Biofeedback'}]);
});
it.each(['P0001','42501','23505','22023'])('does not retry a definitive %s rejection',async code=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:'Already used',code}});await expect(spendEnkindledLifeForce('hero',request)).rejects.toThrow('Already used');expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('bounds retries when both responses are lost',async()=>{
 mocks.rpc.mockRejectedValue(new Error('Offline'));await expect(spendEnkindledLifeForce('hero',request)).rejects.toThrow('Offline');expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it('does not silently replace a failed context read with a new solo turn',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:'Unavailable'}});await expect(getEnkindledTurn('hero')).rejects.toThrow('Unavailable');expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('solo turn retries keep the expected turn and request identifier',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:1,error:null});expect(await advancePsionicSoloTurn('hero','next',0)).toBe(1);
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(mocks.rpc.mock.calls[0][1]).toEqual({p_character_id:'hero',p_request_id:'next',p_expected_turn:0});
});

it('treats an incomplete success response as uncertain instead of clearing recovery',async()=>{
 mocks.rpc.mockResolvedValue({data:{requestId:'stable',hitDiceSpent:2},error:null});
 await expect(spendEnkindledLifeForce('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});
});

const energyRequest={requestId:'energy',operation:'spend' as const,count:1,rolls:[3],sourceFeature:'Psionic Energy Dice'};
const energyReceipt={requestId:'energy',remaining:5,restorationResource:null,restorationUsed:null,energyRevision:1,rolls:[3],replayed:false};
it('Energy Dice retries retain the complete payment and original rolls',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:{...energyReceipt,replayed:true},error:null});
 expect(await settlePsionicEnergy('hero',energyRequest)).toMatchObject({remaining:5,replayed:true});
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['settle_psionic_energy',{p_character_id:'hero',p_request_id:'energy',p_operation:'spend',p_count:1,p_rolls:[3],p_source_feature:'Psionic Energy Dice'}]);
});
it('Restoration accepts an empty saved roll and both tracker representations',async()=>{
 mocks.rpc.mockResolvedValue({data:{...energyReceipt,remaining:6,rolls:[],restorationResource:0,restorationUsed:1},error:null});
 expect(await settlePsionicEnergy('hero',{...energyRequest,operation:'restore',count:0,rolls:[],sourceFeature:'Psionic Restoration'})).toMatchObject({remaining:6,restorationUsed:1});
});
it.each([{remaining:13},{remaining:-1},{remaining:1.5},{energyRevision:-1},{energyRevision:0.5},{rolls:[4]},{requestId:'other'},{restorationUsed:undefined},{restorationResource:'0'}])('keeps recovery when an Energy Dice receipt cannot be trusted: %j',async invalid=>{
 mocks.rpc.mockResolvedValue({data:{...energyReceipt,...invalid},error:null});
 await expect(settlePsionicEnergy('hero',energyRequest)).rejects.toMatchObject({definitelyNotPaid:false});
});

it('requires the saved Connection claim in a free-extension receipt',async()=>{
 const connection={...energyRequest,operation:'connection' as const,count:0,sourceFeature:'Telepathic Connection'};
 mocks.rpc.mockResolvedValueOnce({data:energyReceipt,error:null});await expect(settlePsionicEnergy('hero',connection)).rejects.toMatchObject({definitelyNotPaid:false});
 mocks.rpc.mockResolvedValueOnce({data:{...energyReceipt,connectionUsed:1},error:null});expect(await settlePsionicEnergy('hero',connection)).toMatchObject({connectionUsed:1});
});

const restCharacter={id:'hero',class_name:'Psion',level:7,psionic_energy_revision:2,psionic_hit_dice_revision:0,class_resources:{'psionic-energy-dice':3},feature_uses:{},spell_slots:{}} as unknown as Character;
const restRequest=createPsionicRestRequest(restCharacter,'short',{class_resources:{'psionic-energy-dice':4},feature_uses:{},spell_slots:{}},'rest');
it('rest retries retain the captured expected state and recharge outcome',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost rest response')).mockResolvedValueOnce({data:{requestId:'rest',character:restCharacter,replayed:true},error:null});
 expect(await completePsionicRest('hero',restRequest)).toMatchObject({replayed:true,expected:restRequest.expected});
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(mocks.rpc.mock.calls[0][0]).toBe('complete_psionic_rest');
});
it.each([{id:'other'},{psionic_energy_revision:undefined},{psionic_hit_dice_revision:-1},{class_resources:null},{feature_uses:[]},{spell_slots:undefined}])('keeps an invalid rest receipt uncertain: %j',async invalid=>{
 const c={...restCharacter,...invalid};if(c.spell_slots===undefined)delete (c as Partial<Character>).spell_slots;
 mocks.rpc.mockResolvedValue({data:{requestId:'rest',character:c,replayed:false},error:null});
 await expect(completePsionicRest('hero',restRequest)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('never sends an incomplete saved rest',async()=>{
 await expect(completePsionicRest('hero',{...restRequest,updates:{}})).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});

it('retries selected-pool Surge with the same die size and accepts only balanced allocation',async()=>{
 const selected={requestId:'pool',rolls:[1,5],sourceFeature:'Telekinetic Propel',hitDie:10 as const};
 const saved={requestId:'pool',rolls:[4,5],total:9,hitDiceSpent:3,hitDiceRevision:4,hitDiceSpentByType:{'6':1,'10':2},replayed:true};
 mocks.rpc.mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({data:saved,error:null});
 expect(await spendPsionicSurge('hero',selected)).toEqual(saved);
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['spend_psionic_surge_from_pool',{p_character_id:'hero',p_request_id:'pool',p_rolls:[1,5],p_source_feature:'Telekinetic Propel',p_hit_die:10}]);
 mocks.rpc.mockResolvedValue({data:{...saved,hitDiceSpentByType:{'6':1}},error:null});
 await expect(spendPsionicSurge('hero',selected)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('keeps legacy saved Surge requests on their original endpoint',async()=>{
 mocks.rpc.mockResolvedValue({data:{requestId:'legacy',rolls:[4],total:4,hitDiceSpent:1,hitDiceRevision:1,replayed:true},error:null});
 await spendPsionicSurge('hero',{requestId:'legacy',rolls:[1],sourceFeature:'Biofeedback'});
 expect(mocks.rpc.mock.calls[0][0]).toBe('spend_psionic_surge');expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_hit_die');
});

it.each([[3,5],[5,5],[4,6]])('rejects a Surge receipt that changes the original dice incorrectly: %j',async(first,second)=>{
 const rolls=[first,second];mocks.rpc.mockResolvedValue({data:{requestId:'verify',rolls,total:first+second,hitDiceSpent:1,hitDiceSpentByType:{'6':1},hitDiceRevision:1,replayed:false},error:null});
 await expect(spendPsionicSurge('hero',{requestId:'verify',rolls:[1,5],sourceFeature:'Biofeedback',hitDie:6})).rejects.toMatchObject({definitelyNotPaid:false});
});

it('times out a silent Energy Die payment without retrying or claiming cancellation',async()=>{
 vi.useFakeTimers();let finish!:(v:unknown)=>void;mocks.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const sent=settlePsionicEnergy('hero',energyRequest),rejection=expect(sent).rejects.toMatchObject({definitelyNotPaid:false,message:expect.stringContaining('timed out')});
 await vi.advanceTimersByTimeAsync(15000);await rejection;expect(mocks.rpc).toHaveBeenCalledOnce();
 finish({data:energyReceipt,error:null});await Promise.resolve();
 mocks.rpc.mockResolvedValue({data:{...energyReceipt,replayed:true},error:null});expect((await settlePsionicEnergy('hero',energyRequest)).replayed).toBe(true);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
});
it('times out a turn read instead of leaving Enkindled unavailable forever',async()=>{
 vi.useFakeTimers();mocks.rpc.mockImplementation(()=>new Promise(()=>{}));const sent=getEnkindledTurn('hero'),rejection=expect(sent).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(15000);await rejection;expect(mocks.rpc).toHaveBeenCalledOnce();
});
it('a delayed Energy payment freezes its original rolls and cost for retries and verification',async()=>{
 const input=structuredClone(energyRequest);let reject!:(e:unknown)=>void;mocks.rpc.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;})).mockResolvedValueOnce({data:{...energyReceipt,replayed:true},error:null});
 const sent=settlePsionicEnergy('hero',input);input.rolls[0]=8;input.count=2;reject(new Error('Lost reply'));
 expect((await sent).rolls).toEqual([3]);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_count:1,p_rolls:[3]});
});
it('captures Enkindled turn and extra rolls before waiting for its response',async()=>{
 const input=structuredClone(request);let finish!:(v:unknown)=>void;mocks.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const sent=spendEnkindledLifeForce('hero',input);input.extraRolls[0]=12;input.turn.soloTurn=9;
 finish({data:{requestId:'stable',extraRolls:[2,3],hitDiceSpent:2,hitDiceRevision:1,replayed:false},error:null});expect((await sent).extraRolls).toEqual([2,3]);expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_turn:{soloTurn:0},p_extra_rolls:[2,3]});
});
