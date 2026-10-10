// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('./psionicTurns',()=>({psionicRpc:rpc}));
import {pendingMovementAuraReviews,finishMovementAuraReview,type MovementAuraReview,type MovementAuraDecision} from './movementAuraReviews';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const candidate={candidateId:`${id(6)}:${id(7)}:aura`,originId:id(6),targetId:id(7),auraKey:'aura',originName:'Origin',targetName:'Target',name:'Aura',trigger:'creature_entered' as const,spec:{key:'aura'}};
const review:MovementAuraReview={event:{id:id(1),sequence:'9007199254740993',campaignId:id(2),encounterId:id(3),turnId:id(4),placementId:id(5),capturedAt:'2026-10-10T01:00:00+00:00',context:{version:1,geometryVerified:false,source:'scene_token_placements',tokens:[],moverParticipantIds:[id(7)],kind:'position',from:{x:35,y:35},to:{x:105,y:35},scenes:[],participants:[]}},plan:{candidates:[candidate],warnings:[]}};
const choice:MovementAuraDecision[]=[{candidateId:candidate.candidateId,status:'not_triggered',receiptId:null,reason:'Stayed inside the aura.'}];
const note='Reviewed the complete movement route.',guard=()=>{};
const result=(args:Record<string,unknown>)=>({eventId:id(1),encounterId:id(3),turnId:id(4),requestId:args.p_request,decisions:args.p_decisions,note:args.p_note,replayed:false});
beforeEach(()=>{
 localStorage.clear();rpc.mockReset();rpc.mockImplementation(async(fn,args)=>fn==='pending_movement_aura_reviews'?[review]:fn==='read_movement_aura_review'?null:result(args));
 const tails=new Map<string,Promise<unknown>>();vi.stubGlobal('navigator',{locks:{request:(key:string,_opts:unknown,fn:()=>Promise<unknown>)=>{const work=(tails.get(key)??Promise.resolve()).catch(()=>{}).then(fn);tails.set(key,work);return work;}}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('reads oldest-first evidence without losing bigint ordering',async()=>{
 rpc.mockResolvedValue([review,{...review,event:{...review.event,id:id(8),sequence:'9007199254740994'}}]);expect(await pendingMovementAuraReviews(id(3))).toHaveLength(2);
});
it('does not treat an unreadable queue as empty',async()=>{rpc.mockResolvedValue(null);await expect(pendingMovementAuraReviews(id(3))).rejects.toThrow(/could not be verified/);});
it('rejects duplicate candidate identities',async()=>{rpc.mockResolvedValue([{...review,plan:{candidates:[candidate,candidate],warnings:[]}}]);await expect(pendingMovementAuraReviews(id(3))).rejects.toThrow();});
it('persists the exact decision before committing and clears only a verified receipt',async()=>{
 rpc.mockImplementation(async(fn,args)=>{if(fn==='read_movement_aura_review')return null;expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!)).toMatchObject({requestId:args.p_request,decisions:choice,note});return result(args);});
 expect(await finishMovementAuraReview(id(9),review,choice,note,guard)).toMatchObject({decisions:choice});expect(localStorage.length).toBe(0);
});
it('retains an unknown response and retries the original decision rather than edited choices',async()=>{
 rpc.mockImplementation(async fn=>fn==='read_movement_aura_review'?null:Promise.reject(new Error('offline')));
 await expect(finishMovementAuraReview(id(9),review,choice,note,guard)).rejects.toThrow('offline');expect(localStorage.length).toBe(1);
 const first=rpc.mock.calls.find(c=>c[0]==='finish_movement_aura_review')![1];
 rpc.mockImplementation(async(fn,args)=>fn==='read_movement_aura_review'?null:result(args));
 await finishMovementAuraReview(id(9),review,[{...choice[0],status:'manual',reason:'Another choice'}],'A changed note',guard);
 expect(rpc.mock.calls.filter(c=>c[0]==='finish_movement_aura_review')[1][1]).toEqual(first);
});
it('recovers a recorded winner without resubmitting or patching resources',async()=>{
 rpc.mockResolvedValue({...result({p_request:id(10),p_decisions:choice,p_note:note}),replayed:true});
 expect(await finishMovementAuraReview(id(9),review,choice,note,guard)).toMatchObject({requestId:id(10),replayed:true});expect(rpc).toHaveBeenCalledTimes(1);
});
it('storage failure prevents submission',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('full');});await expect(finishMovementAuraReview(id(9),review,choice,note,guard)).rejects.toThrow('full');expect(rpc.mock.calls.map(c=>c[0])).toEqual(['read_movement_aura_review']);
});
it('wrong completion identity stays pending',async()=>{
 rpc.mockImplementation(async(fn,args)=>fn==='read_movement_aura_review'?null:{...result(args),eventId:id(20)});
 await expect(finishMovementAuraReview(id(9),review,choice,note,guard)).rejects.toThrow();expect(localStorage.length).toBe(1);
});
it('scope changes prevent completion cleanup',async()=>{
 let current=true;const check=()=>{if(!current)throw new Error('changed');};rpc.mockImplementation(async(fn,args)=>{if(fn==='read_movement_aura_review')return null;current=false;return result(args);});
 await expect(finishMovementAuraReview(id(9),review,choice,note,check)).rejects.toThrow('changed');expect(localStorage.length).toBe(1);
});
it('overlapping same-tab clicks share one recorded decision',async()=>{
 const first=finishMovementAuraReview(id(9),review,choice,note,guard),second=finishMovementAuraReview(id(9),review,choice,note,guard);
 expect(first).toBe(second);await first;expect(rpc.mock.calls.filter(c=>c[0]==='finish_movement_aura_review')).toHaveLength(1);
});
it('corrupt saved decisions block new submissions',async()=>{
 localStorage.setItem(`dndkeep:movement-aura-review:${JSON.stringify([id(9),id(3),id(1)])}`,'{broken');
 await expect(finishMovementAuraReview(id(9),review,choice,note,guard)).rejects.toThrow();expect(localStorage.length).toBe(1);expect(rpc).toHaveBeenCalledTimes(1);
});
