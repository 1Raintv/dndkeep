import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mocks.from}}));
import {getTargetSaveBonus,runConcentrationSave} from './pendingAttack';
import {createConcentrationOffer} from './api/concentrationSaves';
vi.mock('./api/concentrationSaves',()=>({createConcentrationOffer:vi.fn(async()=> 'offer'),resolveConcentrationSave:vi.fn()}));
vi.mock('./automations',()=>({resolveAutomation:()=> 'auto'}));
vi.mock('./hooks/useMagicItems',async()=>{
 const {MAGIC_ITEM_MAP}=await import('../data/magicItems');
 return {getMagicItemById:(id:string)=>id==='test-con-override'?{requiresAttunement:true,abilityOverride:{ability:'constitution',value:19}}:MAGIC_ITEM_MAP[id]};
});
it('loads secondary progression for an automated character saving throw',async()=>{
 const character:Record<string,unknown>={level:3,secondary_class:'Fighter',secondary_level:2,intelligence:18,saving_throw_proficiencies:['intelligence'],nat_1_20_saves:false};
 mocks.from.mockImplementation((table:string)=>{
  let columns='';const q={select:vi.fn((value:string)=>{columns=value;return q;}),eq:vi.fn(()=>q),single:async()=>({data:table==='combat_participants'?{participant_type:'character',entity_id:'psion',campaign_id:'campaign'}:Object.fromEntries(columns.split(',').map(key=>[key.trim(),character[key.trim()]]))})};return q;
 });
 const result=await getTargetSaveBonus('participant','INT');
 expect(result.bonus).toBe(7);expect(result.breakdown).toContain('3 (prof)');expect(result.naturalExtremes).toBe(false);
});

function characterReads(character:Record<string,unknown>){
 mocks.from.mockImplementation((table:string)=>{
  let columns='';const result=()=>({data:table==='combat_participants'?{participant_type:'character',entity_id:'psion',campaign_id:'campaign'}:
   table==='campaigns'?{}:Object.fromEntries(columns.split(',').map(key=>[key.trim(),character[key.trim()]]))});
  const q={select:vi.fn((value:string)=>{columns=value;return q;}),eq:vi.fn(()=>q),single:async()=>result(),maybeSingle:async()=>result()};return q;
 });
}
it.each([
 [true,true,12,7],[true,false,12,4],[false,true,12,4],[true,true,20,8],
])('uses active Headband scores for Psion saves (equipped %s, attuned %s, base %s)',async(equipped,attuned,intelligence,expected)=>{
 characterReads({level:3,secondary_class:'Fighter',secondary_level:2,intelligence,saving_throw_proficiencies:['INT'],
  inventory:[{magic_item_id:'headband-of-intellect',equipped,attuned}]});
 expect((await getTargetSaveBonus('participant','INT')).bonus).toBe(expected);
});
it.each([[true,true,7],[true,false,4],[false,true,4]])('snapshots effective CON for concentration (equipped %s, attuned %s)',async(equipped,attuned,bonus)=>{
 vi.mocked(createConcentrationOffer).mockClear();
 characterReads({id:'psion',level:3,secondary_class:'Fighter',secondary_level:2,constitution:12,
  concentration_spell:'Fly',concentration_revision:4,saving_throw_proficiencies:['constitution'],
  inventory:[{magic_item_id:'test-con-override',equipped,attuned}]});
 await runConcentrationSave({campaignId:'campaign',encounterId:null,chainId:'chain',participantId:'participant',targetName:'Psion',damage:80});
 expect(createConcentrationOffer).toHaveBeenCalledWith(expect.objectContaining({bonus,dc:30,revision:4,spell:'Fly',proficient:true}));
});
