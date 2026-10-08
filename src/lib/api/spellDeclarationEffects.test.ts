// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
import {runDeclaredSpellEffects,finishDeclaredSpellEffects,spellEffectsStage,InterruptedSpellEffectsError} from './spellDeclarationEffects';
import {acknowledgeSpellDeclaration} from './declaredSpells';
vi.mock('./declaredSpells',()=>({acknowledgeSpellDeclaration:vi.fn()}));
const request={castId:'cast',userId:'owner',characterId:'hero'} as SpellDeclarationRequest;
beforeEach(()=>{
 localStorage.clear();vi.resetAllMocks();const locks=new Map<string,Promise<unknown>>();
 vi.stubGlobal('navigator',{locks:{request:(name:string,fn:()=>Promise<unknown>)=>{
  const result=(locks.get(name)??Promise.resolve()).catch(()=>{}).then(fn);locks.set(name,result);return result;
 }}});
});
afterEach(()=>vi.unstubAllGlobals());
it('records the ambiguous boundary before applying and keeps it until choices finish',async()=>{
 const apply=vi.fn(async()=>expect(spellEffectsStage(request)).toBe('started'));await runDeclaredSpellEffects(request,apply);
 expect(spellEffectsStage(request)).toBe('started');expect(acknowledgeSpellDeclaration).not.toHaveBeenCalled();
 await finishDeclaredSpellEffects(request);expect(spellEffectsStage(request)).toBe('done');expect(acknowledgeSpellDeclaration).toHaveBeenCalledWith(request);
});
it('does not replay effects that were already started or completed',async()=>{
 const apply=vi.fn(async()=>{});await runDeclaredSpellEffects(request,apply);
 await expect(runDeclaredSpellEffects(request,apply)).rejects.toBeInstanceOf(InterruptedSpellEffectsError);
 await finishDeclaredSpellEffects(request);await runDeclaredSpellEffects(request,apply);expect(apply).toHaveBeenCalledTimes(1);
});
it('a partially failed effect stays visible for review rather than silently repeating',async()=>{
 await expect(runDeclaredSpellEffects(request,async()=>{throw new Error('lost response');})).rejects.toThrow('lost response');
 expect(spellEffectsStage(request)).toBe('started');const apply=vi.fn(async()=>{});
 await expect(runDeclaredSpellEffects(request,apply)).rejects.toBeInstanceOf(InterruptedSpellEffectsError);expect(apply).not.toHaveBeenCalled();
});
it('serializes simultaneous attempts from the same stored cast',async()=>{
 let finish!:()=>void;const apply=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));const first=runDeclaredSpellEffects(request,apply);
 const second=runDeclaredSpellEffects(request,apply);const rejected=expect(second).rejects.toBeInstanceOf(InterruptedSpellEffectsError);
 await Promise.resolve();await Promise.resolve();finish();await first;await rejected;expect(apply).toHaveBeenCalledTimes(1);
});
it('does not share effect status across characters or accounts',async()=>{
 const apply=vi.fn(async()=>{});await runDeclaredSpellEffects(request,apply);
 await runDeclaredSpellEffects({...request,characterId:'other'},apply);await runDeclaredSpellEffects({...request,userId:'other'},apply);expect(apply).toHaveBeenCalledTimes(3);
});
it('requires coordination support before starting any effect',async()=>{
 vi.stubGlobal('navigator',{});const apply=vi.fn(async()=>{});await expect(runDeclaredSpellEffects(request,apply)).rejects.toThrow('safely resume');expect(apply).not.toHaveBeenCalled();
});
it('does not erase another saved request if acknowledgement fails',async()=>{
 vi.mocked(acknowledgeSpellDeclaration).mockImplementation(()=>{throw new Error('Another request replaced this one');});
 await expect(finishDeclaredSpellEffects(request)).rejects.toThrow('Another request');expect(spellEffectsStage(request)).toBe('done');
 const apply=vi.fn(async()=>{});await runDeclaredSpellEffects(request,apply);expect(apply).not.toHaveBeenCalled();
});
