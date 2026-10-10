import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({declare:vi.fn(),turn:vi.fn(),user:'user',guard:vi.fn()}));
vi.mock('./psionicTurns',()=>({PsionicRequestError:class extends Error {constructor(message:string,public definitelyNotPaid:boolean){super(message);}}}));
import {PsionicRequestError} from './psionicTurns';
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('../saveBatch',()=>({declareSaveBatch:m.declare,getSaveBatchTurn:m.turn}));
vi.mock('./liveTurnTransitions',()=>({withCurrentTurnUser:(work:(u:string,g:()=>void)=>Promise<unknown>)=>work(m.user,m.guard)}));
import {runSavedLegendarySave,readSavedLegendarySave} from './savedLegendarySaves';
import type {DeclareSaveBatchInput} from '../saveBatch';
const enc='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333',target='44444444-4444-4444-8444-444444444444';
const input=()=>({campaignId:enc,encounterId:enc,attacker:{id:actor,name:'Actor',type:'creature'},attackName:'Wing',legendaryCost:2,saveDC:15,saveAbility:'DEX',saveSuccessEffect:'none',damageDice:null,damageType:null,inferredCondition:null,targets:[{id:target,name:'Target',participant_type:'character',is_dead:false}]} as DeclareSaveBatchInput);
let storage:Map<string,string>;
beforeEach(()=>{vi.clearAllMocks();m.user='user';storage=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});vi.stubGlobal('navigator',{locks:{request:(_k:string,_o:unknown,work:()=>Promise<unknown>)=>work()}});m.turn.mockResolvedValue(turn);m.declare.mockImplementation(async r=>({chainId:r.savedDeclaration.chainId,rows:[]}));});
it('persists before declaration and retains a completed marker',async()=>{
 m.declare.mockImplementation(async r=>{expect(storage.size).toBe(1);return {chainId:r.savedDeclaration.chainId,rows:[]};});
 await runSavedLegendarySave(input(),null,async()=>true);expect((await readSavedLegendarySave(input()))?.phase).toBe('complete');
});
it('recovers the original request and turn after a lost response',async()=>{
 m.declare.mockRejectedValueOnce(new Error('lost reply'));await expect(runSavedLegendarySave(input(),null,async()=>true)).rejects.toThrow('lost reply');
 const saved=(await readSavedLegendarySave(input()))!;const original=m.declare.mock.calls[0][0];
 await runSavedLegendarySave({...input(),legendaryCost:1},saved.input.savedDeclaration.chainId,async r=>{expect(r.legendaryCost).toBe(2);return true;});
 expect(m.declare.mock.calls[1][0]).toEqual(original);expect(m.turn).toHaveBeenCalledTimes(1);
});
it('unfinished effects keep the request pending',async()=>{await runSavedLegendarySave(input(),null,async()=>false);expect((await readSavedLegendarySave(input()))?.phase).toBe('pending');});
it('a stale second window cannot declare again after completion',async()=>{
 await runSavedLegendarySave(input(),null,async()=>true);await expect(runSavedLegendarySave(input(),null,async()=>true)).rejects.toThrow(/another window/);expect(m.declare).toHaveBeenCalledTimes(1);
});
it('a freshly reviewed completed marker allows an intentional new action',async()=>{
 await runSavedLegendarySave(input(),null,async()=>true);const saved=(await readSavedLegendarySave(input()))!;
 await runSavedLegendarySave(input(),saved.input.savedDeclaration.chainId,async()=>true);expect(m.declare.mock.calls[1][0].savedDeclaration.chainId).not.toBe(saved.input.savedDeclaration.chainId);
});
it('storage failure prevents declaration',async()=>{
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('blocked');}});await expect(runSavedLegendarySave(input(),null,async()=>true)).rejects.toThrow('blocked');expect(m.declare).not.toHaveBeenCalled();
});
it('failed effects retain the original paid request',async()=>{
 await expect(runSavedLegendarySave(input(),null,async()=>{throw new Error('effect interrupted');})).rejects.toThrow('effect interrupted');expect((await readSavedLegendarySave(input()))?.phase).toBe('pending');
});
it('another signed-in account cannot see the saved request',async()=>{
 await runSavedLegendarySave(input(),null,async()=>false);m.user='other';expect(await readSavedLegendarySave(input())).toBeNull();
});

it('never repeats an ambiguous legacy HP application after reload',async()=>{
 m.declare.mockImplementation(async r=>({chainId:r.savedDeclaration.chainId,rows:[{pendingAttackId:target}]}));
 await expect(runSavedLegendarySave(input(),null,async(_i,_b,_g,beforeDamage)=>{beforeDamage(target);throw new Error('lost HP reply');})).rejects.toThrow('lost HP reply');
 const saved=(await readSavedLegendarySave(input()))!;expect(saved.damageAttempts).toEqual([target]);
 await expect(runSavedLegendarySave(input(),saved.input.savedDeclaration.chainId,async(_i,_b,_g,beforeDamage)=>{beforeDamage(target);return true;})).rejects.toThrow(/will not be applied again/);
});

it('a definite first rejection retires only the uncommitted new request',async()=>{
 m.declare.mockRejectedValueOnce(new PsionicRequestError('not enough points',true));await expect(runSavedLegendarySave(input(),null,async()=>true)).rejects.toThrow('not enough points');expect((await readSavedLegendarySave(input()))?.phase).toBe('complete');
});
it('a rejection after an earlier ambiguous reply never discards its request',async()=>{
 m.declare.mockRejectedValueOnce(new Error('lost reply'));await expect(runSavedLegendarySave(input(),null,async()=>true)).rejects.toThrow('lost reply');const saved=(await readSavedLegendarySave(input()))!;
 m.declare.mockRejectedValueOnce(new PsionicRequestError('ownership changed',true));await expect(runSavedLegendarySave(input(),saved.input.savedDeclaration.chainId,async()=>true)).rejects.toThrow('ownership changed');expect((await readSavedLegendarySave(input()))?.phase).toBe('pending');
});
