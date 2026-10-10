import {beforeEach,expect,it,vi} from 'vitest';
import {resetMovementAtomically} from './movementReset';
import {psionicRpc,PsionicRequestError} from './psionicTurns';
vi.mock('./psionicTurns',()=>({psionicRpc:vi.fn(),PsionicRequestError:class extends Error {constructor(message:string,public definitelyNotPaid:boolean){super(message);}}}));
vi.mock('./liveTurnTransitions',()=>({withCurrentTurnUser:(work:(user:string,guard:()=>void)=>Promise<unknown>)=>work('user',()=>{})}));
const enc='11111111-1111-4111-8111-111111111111',part='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333';
const expected={used:15,dashed:true,disengaged:false,revision:'2'};
let saved:Map<string,string>;
beforeEach(()=>{vi.clearAllMocks();saved=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v),removeItem:(k:string)=>saved.delete(k)});vi.stubGlobal('navigator',{locks:{request:(_k:string,_o:unknown,work:()=>Promise<unknown>)=>work()}});});
const respond=()=>vi.mocked(psionicRpc).mockImplementation(async(name,args)=>{
 if(name==='get_movement_reset_context')return expected;
 expect(saved.size).toBe(1);
 return {requestId:args.p_request,encounterId:enc,participantId:part,turnId:args.p_turn,previous:args.p_expected,changed:true,replayed:true};
});
it('persists before mutation and clears only a verified receipt',async()=>{respond();expect((await resetMovementAtomically(enc,part,turn)).changed).toBe(true);expect(saved.size).toBe(0);});
it('retries an unknown result with the original snapshot even after the rendered turn changes',async()=>{
 vi.mocked(psionicRpc).mockResolvedValueOnce(expected).mockRejectedValueOnce(new Error('lost reply'));
 await expect(resetMovementAtomically(enc,part,turn)).rejects.toThrow('lost reply');const body=vi.mocked(psionicRpc).mock.calls[1][1];expect(saved.size).toBe(1);
 respond();await resetMovementAtomically(enc,part,'44444444-4444-4444-8444-444444444444');expect(vi.mocked(psionicRpc).mock.calls[2][1]).toEqual(body);
});
it('keeps malformed receipts for recovery',async()=>{vi.mocked(psionicRpc).mockResolvedValueOnce(expected).mockResolvedValueOnce({});await expect(resetMovementAtomically(enc,part,turn)).rejects.toThrow('could not be verified');expect(saved.size).toBe(1);});
it('a definite rejection allows a fresh reviewed attempt',async()=>{vi.mocked(psionicRpc).mockResolvedValueOnce(expected).mockRejectedValueOnce(new PsionicRequestError('Movement changed',true));await expect(resetMovementAtomically(enc,part,turn)).rejects.toThrow('Movement changed');expect(saved.size).toBe(0);});
it('storage failure prevents mutation',async()=>{vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('storage blocked');}});vi.mocked(psionicRpc).mockResolvedValueOnce(expected);await expect(resetMovementAtomically(enc,part,turn)).rejects.toThrow('storage blocked');expect(psionicRpc).toHaveBeenCalledTimes(1);});
