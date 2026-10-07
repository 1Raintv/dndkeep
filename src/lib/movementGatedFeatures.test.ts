import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({read:vi.fn(),update:vi.fn(),from:vi.fn()}));
vi.mock('./supabase',()=>({updateCharacter:mocks.update,supabase:{from:mocks.from}}));
vi.mock('../data/species',()=>({SPECIES:[{traits:[{name:'Feline Agility',recovery:'movement'}]}]}));
import {resetMovementGatedFeatures} from './movementGatedFeatures';
const input={participantId:'participant',participantType:'character' as const,entityId:'hero',movementUsedFt:0};
beforeEach(()=>{vi.clearAllMocks();mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:mocks.read})})});mocks.read.mockResolvedValue({data:{feature_uses:{'Feline Agility':1,'species:Feline Agility':1,'Psionic Restoration':1}},error:null});mocks.update.mockResolvedValue({error:null});});
it('uses the protected character save when movement traits refresh',async()=>{
 await resetMovementGatedFeatures(input);expect(mocks.update).toHaveBeenCalledWith('hero',{feature_uses:{'Feline Agility':0,'species:Feline Agility':0,'Psionic Restoration':1}});
});
it('does not read or write resources after movement or for a non-character',async()=>{
 await resetMovementGatedFeatures({...input,movementUsedFt:5});await resetMovementGatedFeatures({...input,participantType:'monster'});expect(mocks.from).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
});
it('does not write when no movement-gated use was spent',async()=>{
 mocks.read.mockResolvedValue({data:{feature_uses:{'Psionic Restoration':1}},error:null});await resetMovementGatedFeatures(input);expect(mocks.update).not.toHaveBeenCalled();
});
