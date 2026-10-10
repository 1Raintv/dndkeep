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
 localStorage.clear();vi.resetAllMocks();let tail=Promise.resolve();
 vi.stubGlobal('navigator',{locks:{request:(_name:string,task:()=>unknown)=>{const next=tail.then(task);tail=next.then(()=>undefined,()=>undefined);return next;}}});
 mock.begin.mockResolvedValue(declaration());mock.finish.mockResolvedValue(declaration());mock.enhance.mockResolvedValue(declaration());
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('saves before RNG and roundtrips the exact roll until verified submission',async()=>{
 const roll=vi.fn(()=>{expect(()=>pendingTelepath(id(1))).toThrow(/recovery/);return 3;});
 const pending=await prepareTelepath(id(1),input(),roll);expect(pendingTelepath(id(1))).toEqual(pending);expect(pendingTelepath(id(2))).toBeNull();
 await sendTelepath(id(1),pending);expect(mock.begin).toHaveBeenCalledWith(id(1),{...input(),roll:3});expect(pendingTelepath(id(1))).toBeNull();expect(roll).toHaveBeenCalledTimes(1);
});
it('serializes competing tab preparations without a second roll',async()=>{
 const roll=vi.fn(()=>3);const results=await Promise.allSettled([prepareTelepath(id(1),input(),roll),prepareTelepath(id(1),{...input(),requestId:id(11)},roll)]);
 expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);expect(roll).toHaveBeenCalledTimes(1);
});
it('storage failure before the marker never rolls',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('full');});const roll=vi.fn(()=>3);
 await expect(prepareTelepath(id(1),input(),roll)).rejects.toThrow('full');expect(roll).not.toHaveBeenCalled();
});
it('failure after RNG retains an interruption marker across retry',async()=>{
 const write=localStorage.setItem.bind(localStorage);let writes=0;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(++writes===2)throw new Error('full');write(k,v);});
 const roll=vi.fn(()=>3);await expect(prepareTelepath(id(1),input(),roll)).rejects.toThrow('full');await expect(prepareTelepath(id(1),input(),roll)).rejects.toThrow(/recovery/);expect(roll).toHaveBeenCalledTimes(1);
});
it.each([new Error('lost reply'),Object.assign(new Error('permission changed'),{definitelyNotPaid:true})])('keeps failed requests and retries identical dice (%s)',async error=>{
 const pending=await prepareTelepath(id(1),input(),()=>3);mock.begin.mockRejectedValueOnce(error);
 await expect(sendTelepath(id(1),pending)).rejects.toThrow();expect(pendingTelepath(id(1))).toEqual(pending);
 await sendTelepath(id(1),pending);expect(mock.begin.mock.calls[0]).toEqual(mock.begin.mock.calls[1]);expect(pendingTelepath(id(1))).toBeNull();
});
it('blocks a changed outcome while settlement is uncertain',async()=>{
 const request={declarationId:id(10)};mock.finish.mockRejectedValueOnce(new Error('lost'));await expect(sendTelepath(id(1),{kind:'finish',request})).rejects.toThrow();
 await expect(sendTelepath(id(1),{kind:'cancel',request})).rejects.toThrow(/recovery/);expect(mock.finish).toHaveBeenCalledTimes(1);
});
it.each(['{broken','null','{"kind":"preparing"}'])('preserves corrupt drafts and never rolls (%s)',async raw=>{
 localStorage.setItem('dndkeep:telepath:'+id(1),raw);const roll=vi.fn(()=>3);await expect(prepareTelepath(id(1),input(),roll)).rejects.toThrow(/recovery/);expect(roll).not.toHaveBeenCalled();expect(localStorage.getItem('dndkeep:telepath:'+id(1))).toBe(raw);
});
it('requires browser locking before any dice or storage',async()=>{
 vi.stubGlobal('navigator',{});const roll=vi.fn(()=>3);await expect(prepareTelepath(id(1),input(),roll)).rejects.toThrow(/browser/);expect(roll).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
});
it('validates target before a marker and retains invalid RNG as interrupted',async()=>{
 const roll=vi.fn(()=>3);await expect(prepareTelepath(id(1),{...input(),review:{distanceFeet:99,visible:true,confirmed:true}},roll)).rejects.toThrow(/target/);expect(roll).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
 await expect(prepareTelepath(id(1),input(),()=>99)).rejects.toThrow(/recovery/);expect(()=>pendingTelepath(id(1))).toThrow(/recovery/);
});
it('saves Enkindled dice before payment and rejects an unearned enhancement',async()=>{
 const r=declaration(),roll=vi.fn(()=>2);await expect(prepareTelepathEnkindled(id(1),r,id(11),2,roll)).rejects.toThrow(/enhancement/);expect(roll).not.toHaveBeenCalled();
 r.psion_level=20;r.context.psionLevel=20;r.context.energyRemaining=12;
 const pending=await prepareTelepathEnkindled(id(1),r,id(11),2,roll);expect(pending).toMatchObject({kind:'enhance',request:{extraRolls:[2,2]}});
 await sendTelepath(id(1),pending);expect(mock.enhance).toHaveBeenCalledTimes(1);expect(roll).toHaveBeenCalledTimes(2);
});
it('copies inputs before waiting for the lock',async()=>{
 const request=input(),pending=prepareTelepath(id(1),request,()=>3);request.review.distanceFeet=99;expect((await pending).request).toMatchObject({review:{distanceFeet:30}});
});
