import {beforeEach,expect,it,vi} from 'vitest';
import {cancelTelepathReactionByDm,getTelepathAttackContext,validTelepathAttackContext,type TelepathAttackContext} from './telepathReactions';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('./psionicTurns',()=>({psionicRpc:mock.rpc}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const saved=():TelepathAttackContext=>({characterId:id(1),feature:'distraction',psionLevel:10,energyRemaining:8,reactionAvailable:true,telepathyRange:60,rangeVerified:true,spatialReviewRequired:true,
 budget:{context:{actorId:id(1),turnId:id(8),ownerTurnId:'own',encounterId:id(2),participantId:id(3),isOwnTurn:false},spent:{action:false,bonusAction:false,reaction:false},claimed:{action:false,bonusAction:false,reaction:false}},
 subject:{participantId:id(4),combatantId:id(5),entityId:'enemy',participantType:'creature',self:false},
 attack:{id:id(6),triggerTurnId:id(8),updatedAt:'2026-10-10T16:00:00Z',total:17,targetAC:15,result:'hit',cover:null,snapshot:{version:1,attackId:id(6),campaignId:id(7),encounterId:id(2),attackerId:id(4),targetId:id(3),d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'}}});
beforeEach(()=>{mock.rpc.mockReset();});
it('reads a scoped context without inventing visibility approval',async()=>{
 mock.rpc.mockResolvedValue(saved());expect(await getTelepathAttackContext(id(1),id(6),'distraction')).toEqual(saved());
 expect(mock.rpc).toHaveBeenCalledWith('get_telepath_attack_context',{p_character:id(1),p_attack:id(6),p_feature:'distraction'});
});
it.each([
 (c:TelepathAttackContext)=>{c.characterId=id(9);},
 (c:TelepathAttackContext)=>{c.psionLevel=2;},
 (c:TelepathAttackContext)=>{c.energyRemaining=9;},
 (c:TelepathAttackContext)=>{c.budget.spent.reaction=true;},
 (c:TelepathAttackContext)=>{c.budget.claimed.reaction=true;},
 (c:TelepathAttackContext)=>{c.budget.context.encounterId=id(9);},
 (c:TelepathAttackContext)=>{c.subject.self=true;},
 (c:TelepathAttackContext)=>{c.subject.participantId=id(9);},
 (c:TelepathAttackContext)=>{c.telepathyRange=61;},
 (c:TelepathAttackContext)=>{c.rangeVerified=false;},
 (c:TelepathAttackContext)=>{c.attack.total=14;},
 (c:TelepathAttackContext)=>{c.attack.updatedAt='bad';},
 (c:TelepathAttackContext)=>{c.attack.cover='total';},
 (c:TelepathAttackContext)=>{c.attack.triggerTurnId=id(9);},
 (c:TelepathAttackContext)=>{c.attack.triggerTurnId='';},
])('rejects inconsistent context %i',change=>{const c=saved();change(c);expect(validTelepathAttackContext(c,id(1),id(6),'distraction')).toBe(false);});
it('supports unknown range as explicit review and a current miss after AC changes',()=>{
 const c=saved();c.rangeVerified=false;c.telepathyRange=null;expect(validTelepathAttackContext(c,id(1),id(6),'distraction')).toBe(true);
 c.feature='bolstering';c.attack.targetAC=20;c.attack.result='miss';expect(validTelepathAttackContext(c,id(1),id(6),'bolstering')).toBe(true);
});
it('fails before RPC for malformed identity and rejects malformed success',async()=>{
 await expect(getTelepathAttackContext('bad',id(6),'distraction')).rejects.toThrow();expect(mock.rpc).not.toHaveBeenCalled();
 mock.rpc.mockResolvedValue({});await expect(getTelepathAttackContext(id(1),id(6),'distraction')).rejects.toThrow('could not be verified');
});

it('DM cancellation retries the same saved identity and retains spent resources',async()=>{
 const result={requestId:id(1),cancelled:true,reactionCost:1,energyCost:0,energy:null,replayed:true};mock.rpc.mockResolvedValue(result);
 expect(await cancelTelepathReactionByDm(id(1),' Character left ')).toEqual(result);
 expect(mock.rpc).toHaveBeenCalledWith('cancel_telepath_reaction_by_dm',{p_request:id(1),p_reason:'Character left'},true);
});
it.each(['',' ', 'x'.repeat(501)])('rejects an invalid cancellation reason before sending',async reason=>{
 await expect(cancelTelepathReactionByDm(id(1),reason)).rejects.toThrow();expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([{requestId:id(9)},{cancelled:false},{reactionCost:0},{energyCost:1},{energy:{}},{replayed:null}])('rejects cancellation evidence that changes identity or costs %j',async patch=>{
 mock.rpc.mockResolvedValue({requestId:id(1),cancelled:true,reactionCost:1,energyCost:0,energy:null,replayed:false,...patch});
 await expect(cancelTelepathReactionByDm(id(1),'Character left')).rejects.toThrow('could not be confirmed');
});
