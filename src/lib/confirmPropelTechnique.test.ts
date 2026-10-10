// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {closePendingPropelTechnique,confirmPropelTechnique,resumePropelTechnique} from './confirmPropelTechnique';
import {pendingPropelTechniques,rememberPropelTechnique} from './propelTechniqueRecovery';
import type {PropelRecord} from './api/psionicPropel';
const mock=vi.hoisted(()=>({close:vi.fn(),choose:vi.fn(),options:vi.fn()}));
vi.mock('./api/propelTechniques',()=>({closePropelTechnique:mock.close,choosePropelTechnique:mock.choose,availablePropelTechniques:mock.options}));
const character='00000000-0000-4000-8000-000000000001',declaration='00000000-0000-4000-8000-000000000002';
const row={character_id:character,request_id:declaration} as PropelRecord;
const receipt={characterId:character,declarationId:declaration,choice:'boost',replayed:false};
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();mock.options.mockReturnValue([{kind:'boost'},{kind:'disorient'},{kind:'bolt'}]);mock.choose.mockResolvedValue(receipt);});
afterEach(()=>{vi.restoreAllMocks();});
it('persists the exact choice before sending and clears it only after confirmation',async()=>{
 mock.choose.mockImplementation(async()=>{expect(pendingPropelTechniques(character)).toEqual([{declarationId:declaration,choice:'boost'}]);return receipt;});
 await expect(confirmPropelTechnique(row,'boost')).resolves.toEqual(receipt);expect(pendingPropelTechniques(character)).toEqual([]);
});
it('does not send when storage is unavailable',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});await expect(confirmPropelTechnique(row,'boost')).rejects.toThrow('Storage full');expect(mock.choose).not.toHaveBeenCalled();
});
it.each([new Error('Network unavailable'),Object.assign(new Error('Rule rejection'),{definitelyNotPaid:true})])('keeps the attempt after %s until an authoritative read',async error=>{
 mock.choose.mockRejectedValue(error);await expect(confirmPropelTechnique(row,'boost')).rejects.toThrow();expect(pendingPropelTechniques(character)).toEqual([{declarationId:declaration,choice:'boost'}]);
 await expect(confirmPropelTechnique(row,'bolt')).rejects.toThrow(/original/);expect(mock.choose).toHaveBeenCalledOnce();
});
it('a fresh recovery reads first and resends only the original unsaved choice',async()=>{
 rememberPropelTechnique(character,{declarationId:declaration,choice:'boost'});mock.choose.mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);
 await expect(resumePropelTechnique(row)).resolves.toEqual(receipt);expect(mock.choose.mock.calls.map(call=>call[1])).toEqual([undefined,'boost']);expect(pendingPropelTechniques(character)).toEqual([]);
});
it('shows a winning choice from another tab without sending the losing local choice',async()=>{
 rememberPropelTechnique(character,{declarationId:declaration,choice:'boost'});mock.choose.mockResolvedValue({...receipt,choice:'disorient'});
 await expect(resumePropelTechnique(row)).resolves.toMatchObject({choice:'disorient'});expect(mock.choose).toHaveBeenCalledOnce();expect(pendingPropelTechniques(character)).toEqual([]);
});
it('reads across browsers without inventing a local choice',async()=>{
 mock.choose.mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);await expect(resumePropelTechnique(row)).resolves.toBeNull();await expect(resumePropelTechnique(row)).resolves.toEqual(receipt);expect(localStorage.length).toBe(0);
});
it('retains the choice when authoritative reading fails',async()=>{
 rememberPropelTechnique(character,{declarationId:declaration,choice:'none'});mock.choose.mockRejectedValue(new Error('Read unavailable'));
 await expect(resumePropelTechnique(row)).rejects.toThrow('Read unavailable');expect(pendingPropelTechniques(character)).toEqual([{declarationId:declaration,choice:'none'}]);expect(mock.choose).toHaveBeenCalledOnce();
});
it('invalid technique eligibility does not leave a draft or send',async()=>{
 mock.options.mockReturnValue([]);await expect(confirmPropelTechnique(row,'boost')).rejects.toThrow(/cannot use/);expect(localStorage.length).toBe(0);expect(mock.choose).not.toHaveBeenCalled();
});
it('failed cleanup preserves a safe replay',async()=>{
 vi.spyOn(localStorage,'removeItem').mockImplementation(()=>{throw new Error('Storage unavailable');});await expect(confirmPropelTechnique(row,'boost')).resolves.toEqual(receipt);expect(pendingPropelTechniques(character)).toEqual([{declarationId:declaration,choice:'boost'}]);
});

it('keeps a failed closure across recovery without resending the old effect',async()=>{
 rememberPropelTechnique(character,{declarationId:declaration,choice:'boost'});
 mock.close.mockRejectedValueOnce(new Error('Lost closure reply'));
 await expect(closePendingPropelTechnique(row)).rejects.toThrow('Lost closure reply');
 expect(pendingPropelTechniques(character)).toMatchObject([{choice:'boost',closeRequested:true}]);
 mock.choose.mockResolvedValue(null);mock.close.mockResolvedValue({...receipt,choice:'none'});
 await expect(resumePropelTechnique(row)).resolves.toMatchObject({choice:'none'});
 expect(mock.choose).toHaveBeenCalledWith(row);expect(mock.close).toHaveBeenCalledTimes(2);expect(pendingPropelTechniques(character)).toEqual([]);
});
it('closing returns an already committed effect without undoing it',async()=>{
 rememberPropelTechnique(character,{declarationId:declaration,choice:'boost'});mock.close.mockResolvedValue(receipt);
 await expect(closePendingPropelTechnique(row)).resolves.toEqual(receipt);expect(pendingPropelTechniques(character)).toEqual([]);
});
