// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),clock:vi.fn(),ticks:vi.fn(),recharge:vi.fn(),offer:vi.fn(),death:vi.fn(),session:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth:{getSession:m.session,onAuthStateChange:m.subscribe}}}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./combatClock',async original=>({...await original<typeof import('./combatClock')>(),getCombatClockContext:m.clock}));
vi.mock('./turnEffects',()=>({processSavedTurnEffects:m.ticks}));
vi.mock('./turnRecharges',()=>({processSavedTurnRecharge:m.recharge}));
vi.mock('../deathSaves',()=>({createPendingDeathSave:m.offer,resolveAutomaticDeathSave:m.death}));
import {advanceLiveTurnTransition,recoverLiveTurnTransition,withCurrentTurnUser,type LiveTurnTransition} from './liveTurnTransitions';
const id=(n:number)=>`${n}0000000-0000-4000-8000-000000000000`;
const user=id(1),enc=id(2),turn=id(3),incoming=id(4),req=id(5);
const context=():LiveTurnTransition=>({requestId:req,encounterId:enc,campaignId:id(6),expectedTurn:turn,clock:{requestId:req,encounterId:enc,incomingId:incoming,turnId:id(7),index:0,round:2,roundWrapped:true,campaignRounds:1,replayed:false},outgoing:{id:id(8),name:'Old',type:'character',hidden:false,round:1},incoming:{id:incoming,name:'New',type:'character',hidden:false,characterId:id(9)},deathRequired:false,deathMode:'auto',lairActions:0,complete:false,deathComplete:false});
let server:LiveTurnTransition|null;
beforeEach(()=>{
 vi.resetAllMocks();localStorage.clear();server=null;
 m.clock.mockResolvedValue({incomingId:incoming,nextIndex:0,nextRound:2});
 m.rpc.mockImplementation(async(name,args)=>{
  if(name==='read_live_turn_transition')return server;
  if(name==='begin_live_turn_transition'){server={...context(),requestId:args.p_request,clock:{...context().clock,requestId:args.p_request}};return server;}
  if(name==='mark_live_turn_death_complete'){server={...server!,deathComplete:true};return server;}
  if(name==='finish_live_turn_transition'){server={...server!,complete:true};return server;}
  throw new Error('Unexpected RPC');
 });
 m.session.mockResolvedValue({data:{session:{user:{id:user}}},error:null});m.subscribe.mockReturnValue({data:{subscription:{unsubscribe:m.unsubscribe}}});
});
it('persists before the clock and runs incoming effects in order',async()=>{
 const sequence:string[]=[];m.recharge.mockImplementation(async()=>{sequence.push('recharge');expect(localStorage.length).toBe(1);});m.ticks.mockImplementation(async()=>{sequence.push('ticks');expect(server?.deathComplete).toBe(true);});
 await advanceLiveTurnTransition(user,enc,turn,()=>{});expect(sequence).toEqual(['recharge','ticks']);expect(server?.complete).toBe(true);expect(localStorage.length).toBe(0);
 expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(['begin_live_turn_transition','mark_live_turn_death_complete','finish_live_turn_transition']);
});
it('recovers a server-pending turn on a device with no local proposal',async()=>{
 server=context();expect(await recoverLiveTurnTransition(user,enc,()=>{})).toBe(true);expect(m.clock).not.toHaveBeenCalled();expect(m.ticks).toHaveBeenCalledWith(user,expect.objectContaining({turnId:id(7),timing:'turn_start'}),expect.any(Function));
});
it('no pending work returns control to outgoing processing',async()=>{expect(await recoverLiveTurnTransition(user,enc,()=>{})).toBe(false);expect(m.ticks).not.toHaveBeenCalled();});
it('a lost clock reply retains the request and recovers the committed incoming work',async()=>{
 const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,args)=>{const r=await original(name,args);if(name==='begin_live_turn_transition')throw new Error('Lost reply');return r;});
 await expect(advanceLiveTurnTransition(user,enc,turn,()=>{})).rejects.toThrow('Lost reply');expect(localStorage.length).toBe(1);
 expect(await recoverLiveTurnTransition(user,enc,()=>{})).toBe(true);expect(m.clock).toHaveBeenCalledTimes(1);expect(localStorage.length).toBe(0);
});
it.each(['auto','prompt','off'] as const)('checks the captured death-save setting %s before ticks',async mode=>{
 server={...context(),deathRequired:true,deathMode:mode};await recoverLiveTurnTransition(user,enc,()=>{});
 expect(m.death).toHaveBeenCalledTimes(mode==='auto'?1:0);expect(m.offer).toHaveBeenCalledTimes(mode==='prompt'?1:0);expect(m.ticks).toHaveBeenCalledOnce();
});
it('a resumed completed death phase never requests another death save',async()=>{server={...context(),deathRequired:true,deathComplete:true};await recoverLiveTurnTransition(user,enc,()=>{});expect(m.death).not.toHaveBeenCalled();});
it('incoming failures retain the server work and prevent final completion',async()=>{
 server=context();m.ticks.mockRejectedValueOnce(new Error('Tick reply lost'));await expect(recoverLiveTurnTransition(user,enc,()=>{})).rejects.toThrow('Tick reply lost');expect(server.complete).toBe(false);
 expect(await recoverLiveTurnTransition(user,enc,()=>{})).toBe(true);expect(server.complete).toBe(true);
});
it('completed history clears recovery without repeating any incoming phase',async()=>{server={...context(),complete:true,deathComplete:true};await recoverLiveTurnTransition(user,enc,()=>{});expect(m.ticks).not.toHaveBeenCalled();expect(m.recharge).not.toHaveBeenCalled();});
it('malformed local recovery cannot start another clock',async()=>{localStorage.setItem(`dndkeep:live-turn:${user}:${enc}`,'bad');await expect(recoverLiveTurnTransition(user,enc,()=>{})).rejects.toThrow('could not be verified');expect(m.rpc).not.toHaveBeenCalled();});
it('rejects a mismatched incoming receipt before running effects',async()=>{server={...context(),clock:{...context().clock,incomingId:id(9)}};await expect(recoverLiveTurnTransition(user,enc,()=>{})).rejects.toThrow('could not be verified');expect(m.recharge).not.toHaveBeenCalled();});
it('auth changes invalidate work and release the subscription',async()=>{
 await expect(withCurrentTurnUser(async(_user,guard)=>{m.subscribe.mock.calls[0][0]('SIGNED_OUT',null);guard();})).rejects.toThrow('Sign-in changed');expect(m.unsubscribe).toHaveBeenCalledOnce();
});

it('rejects a substituted completion receipt and retains the saved request',async()=>{
 const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,args)=>{const r=await original(name,args);return name==='finish_live_turn_transition'?{...r,clock:{...r.clock,turnId:id(8)}}:r;});
 await expect(advanceLiveTurnTransition(user,enc,turn,()=>{})).rejects.toThrow('could not be verified');expect(localStorage.length).toBe(1);
});
it('malformed non-character death work never calls the death-save API',async()=>{
 server={...context(),deathRequired:true,incoming:{...context().incoming,type:'monster'}};
 await expect(recoverLiveTurnTransition(user,enc,()=>{})).rejects.toThrow('could not be verified');expect(m.death).not.toHaveBeenCalled();
});

it('reviews movement before retrying an uncommitted saved clock request',async()=>{
 const original=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation(async(name,args)=>{if(name==='begin_live_turn_transition')throw new Error('Movement pending');return original(name,args);});
 await expect(advanceLiveTurnTransition(user,enc,turn,()=>{})).rejects.toThrow('Movement pending');
 const review=vi.fn(async()=>{throw new Error('Review postponed');});m.rpc.mockClear();
 await expect(recoverLiveTurnTransition(user,enc,()=>{},review)).rejects.toThrow('Review postponed');
 expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(['read_live_turn_transition']);expect(localStorage.length).toBe(1);
 m.rpc.mockImplementation(original);await recoverLiveTurnTransition(user,enc,()=>{},async()=>{});expect(localStorage.length).toBe(0);
});
