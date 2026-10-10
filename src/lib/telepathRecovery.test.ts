// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {TelepathRecord} from './api/telepathLifecycle';
import type {TelepathAttackContext} from './api/telepathReactions';
import {pendingTelepath,prepareTelepath,prepareTelepathEnkindled,sendTelepath} from './telepathRecovery';
const mock=vi.hoisted(()=>({begin:vi.fn(),finish:vi.fn(),enhance:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{}}));
vi.mock('./api/telepathLifecycle',async original=>({...await original<typeof import('./api/telepathLifecycle')>(),beginTelepathReaction:mock.begin,finishTelepathReaction:mock.finish,enhanceTelepathReaction:mock.enhance}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const saved=():TelepathAttackContext=>({characterId:id(1),feature:'distraction',psionLevel:10,energyRemaining:8,reactionAvailable:true,telepathyRange:60,rangeVerified:true,spatialReviewRequired:true,
 budget:{context:{actorId:id(1),turnId:id(8),ownerTurnId:'own',encounterId:id(2),participantId:id(3),isOwnTurn:false},spent:{action:false,bonusAction:false,reaction:false},claimed:{action:false,bonusAction:false,reaction:false}},
 subject:{participantId:id(4),combatantId:id(5),entityId:'enemy',participantType:'creature',self:false},
 attack:{id:id(6),triggerTurnId:id(8),updatedAt:'2026-10-10T16:00:00Z',total:17,targetAC:15,result:'hit',cover:null,snapshot:{version:1,attackId:id(6),campaignId:id(7),encounterId:id(2),attackerId:id(4),targetId:id(3),d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'}}});
function declaration():TelepathRecord{
 const context=saved(),review={distanceFeet:30,visible:true,confirmed:true as const};
 return {request_id:id(10),character_id:id(1),attack_id:id(6),request:{attackId:id(6),feature:'distraction',expected:context,roll:3,review},context,review,
 base_roll:3,psion_level:10,source_feature:'Telepathic Distraction',created_at:'2026-10-10T16:00:00Z',enhancements:[],result:null,
 action_receipt:{claim:{requestId:id(10),actorId:id(1),turnId:id(8),ownerTurnId:'own',kind:'reaction',grantId:'normal:reaction',grantSource:'normal',purpose:'feature',sourceId:'Telepathic Distraction'},attackLimit:null,replayed:false}};
}

const input=()=>{const r=declaration();const {roll:_roll,...request}=r.request;return {...request,requestId:r.request_id};};
beforeEach(()=>{
 localStorage.clear();vi.resetAllMocks();vi.spyOn(crypto,'randomUUID').mockReturnValue('40000000-0000-4000-8000-c00000000000');let tail=Promise.resolve();
 vi.stubGlobal('navigator',{locks:{request:(_name:string,task:()=>unknown)=>{const next=tail.then(task);tail=next.then(()=>undefined,()=>undefined);return next;}}});
 mock.begin.mockResolvedValue(declaration());mock.finish.mockResolvedValue(declaration());mock.enhance.mockResolvedValue(declaration());
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('roundtrips the original seed-derived die until verified submission',async()=>{
 const pending=await prepareTelepath(id(1),input());expect(pendingTelepath(id(1))).toEqual(pending);expect(pendingTelepath(id(2))).toBeNull();
 await sendTelepath(id(1),pending);expect(mock.begin).toHaveBeenCalledWith(id(1),{...input(),roll:3});expect(pendingTelepath(id(1))).toBeNull();
 expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});
it('serializes competing preparations without generating a second seed',async()=>{
 const results=await Promise.allSettled([prepareTelepath(id(1),input()),prepareTelepath(id(1),{...input(),requestId:id(11)})]);
 expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});
it('failure of the initial write leaves no displayed or submitted dice',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('full');});
 await expect(prepareTelepath(id(1),input())).rejects.toThrow('full');expect(localStorage.length).toBe(0);expect(mock.begin).not.toHaveBeenCalled();
});
function failFinalWrite(){
 const write=localStorage.setItem.bind(localStorage);let writes=0;
 return vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(++writes>1)throw new Error('full');write(k,v);});
}
it('reload reconstructs identical dice without RNG after the final write fails',async()=>{
 const storage=failFinalWrite();await expect(prepareTelepath(id(1),input())).rejects.toThrow(/saved Telepath/);
 const marker=localStorage.getItem('dndkeep:telepath:'+id(1))!;
 expect(JSON.parse(marker)).toMatchObject({kind:'preparing',version:2,operation:'begin',request:input()});
 vi.resetModules();const reloaded=await import('./telepathRecovery');
 const rng=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('must not reroll');});
 const pending=reloaded.pendingTelepath(id(1))!;expect(pending).toMatchObject({kind:'begin',request:{roll:3}});
 await expect(reloaded.prepareTelepath(id(1),input())).rejects.toThrow(/recovery/);
 await expect(reloaded.sendTelepath(id(1),pending)).rejects.toThrow(/saved Telepath/);expect(mock.begin).not.toHaveBeenCalled();
 expect(localStorage.getItem('dndkeep:telepath:'+id(1))).toBe(marker);
 storage.mockRestore();await reloaded.sendTelepath(id(1),pending);expect(mock.begin).toHaveBeenCalledWith(id(1),{...input(),roll:3});
 expect(reloaded.pendingTelepath(id(1))).toBeNull();expect(crypto.randomUUID).toHaveBeenCalledTimes(1);expect(rng).not.toHaveBeenCalled();
});
it.each([new Error('lost reply'),Object.assign(new Error('permission changed'),{definitelyNotPaid:true})])('keeps failed requests and retries identical dice (%s)',async error=>{
 const pending=await prepareTelepath(id(1),input());mock.begin.mockRejectedValueOnce(error);
 await expect(sendTelepath(id(1),pending)).rejects.toThrow();expect(pendingTelepath(id(1))).toEqual(pending);
 await sendTelepath(id(1),pending);expect(mock.begin.mock.calls[0]).toEqual(mock.begin.mock.calls[1]);expect(pendingTelepath(id(1))).toBeNull();
});
it('blocks a changed outcome while settlement is uncertain',async()=>{
 const request={declarationId:id(10)};mock.finish.mockRejectedValueOnce(new Error('lost'));await expect(sendTelepath(id(1),{kind:'finish',request})).rejects.toThrow();
 await expect(sendTelepath(id(1),{kind:'cancel',request})).rejects.toThrow(/recovery/);expect(mock.finish).toHaveBeenCalledTimes(1);
});
it.each(['{broken','null','{"kind":"preparing"}','{"kind":"preparing","requestId":"legacy"}'])('preserves unresolvable legacy/corrupt drafts (%s)',async raw=>{
 localStorage.setItem('dndkeep:telepath:'+id(1),raw);await expect(prepareTelepath(id(1),input())).rejects.toThrow(/recovery/);
 expect(crypto.randomUUID).not.toHaveBeenCalled();expect(localStorage.getItem('dndkeep:telepath:'+id(1))).toBe(raw);
});
it('requires locking before entropy or storage',async()=>{
 vi.stubGlobal('navigator',{});await expect(prepareTelepath(id(1),input())).rejects.toThrow(/browser/);
 expect(crypto.randomUUID).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
});
it('rejects invalid targets before committing any preparation',async()=>{
 await expect(prepareTelepath(id(1),{...input(),review:{distanceFeet:99,visible:true,confirmed:true}})).rejects.toThrow(/target/);
 expect(crypto.randomUUID).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
});
it('copies inputs before waiting for the lock',async()=>{
 const request=input(),pending=prepareTelepath(id(1),request);request.review.distanceFeet=99;
 expect((await pending).request).toMatchObject({review:{distanceFeet:30}});
});
it('restores two independent Enkindled dice after reload without another seed or payment',async()=>{
 const r=declaration();await expect(prepareTelepathEnkindled(id(1),r,id(11),2)).rejects.toThrow(/enhancement/);
 expect(crypto.randomUUID).not.toHaveBeenCalled();r.psion_level=20;r.context.psionLevel=20;r.context.energyRemaining=12;
 const storage=failFinalWrite();await expect(prepareTelepathEnkindled(id(1),r,id(11),2)).rejects.toThrow(/saved Telepath/);
 vi.resetModules();const reloaded=await import('./telepathRecovery');const pending=reloaded.pendingTelepath(id(1))!;
 expect(pending).toMatchObject({kind:'enhance',request:{extraRolls:[4,10]}});
 expect(mock.enhance).not.toHaveBeenCalled();storage.mockRestore();await reloaded.sendTelepath(id(1),pending);
 expect(mock.enhance).toHaveBeenCalledWith(id(1),{declarationId:id(10),requestId:id(11),kind:'enkindled',extraRolls:[4,10],hitDie:null});
 expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});
it('does not accept changed faces or replace a different durable request',async()=>{
 const storage=failFinalWrite();await expect(prepareTelepath(id(1),input())).rejects.toThrow();storage.mockRestore();
 const original=pendingTelepath(id(1))!;const changed=structuredClone(original);if(changed.kind==='begin')changed.request.roll=8;
 await expect(sendTelepath(id(1),changed)).rejects.toThrow(/recovery/);
 expect(pendingTelepath(id(1))).toEqual(original);
 const newer={kind:'cancel',request:{declarationId:id(12)}} as const;localStorage.setItem('dndkeep:telepath:'+id(1),JSON.stringify(newer));
 await expect(sendTelepath(id(1),original)).rejects.toThrow(/recovery/);expect(mock.begin).not.toHaveBeenCalled();expect(pendingTelepath(id(1))).toEqual(newer);
});
it.each(['version','attemptId','character','count'])('rejects malformed recovery evidence: %s',async field=>{
 const storage=failFinalWrite();await expect(prepareTelepath(id(1),input())).rejects.toThrow();storage.mockRestore();
 const marker=JSON.parse(localStorage.getItem('dndkeep:telepath:'+id(1))!);
 if(field==='version')marker.version=3;
 if(field==='attemptId')marker.attemptId=id(1).replace('-4000-','-1000-');
 if(field==='character')marker.request.expected.characterId=id(2);
 if(field==='count'){marker.operation='enkindled';marker.count=3;marker.declaration=declaration();}
 localStorage.setItem('dndkeep:telepath:'+id(1),JSON.stringify(marker));
 expect(()=>pendingTelepath(id(1))).toThrow(/recovery/);expect(mock.begin).not.toHaveBeenCalled();
});

it('does not claim recovery exists when a new settlement cannot be saved',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage unavailable');});
 await expect(sendTelepath(id(1),{kind:'finish',request:{declarationId:id(10)}})).rejects.toThrow('storage unavailable');
 expect(pendingTelepath(id(1))).toBeNull();expect(mock.finish).not.toHaveBeenCalled();
});
