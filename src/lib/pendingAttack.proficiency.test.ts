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

const ring=(equipped:boolean,attuned:boolean)=>({magic_item_id:'ring-protection',magical:true,equipped,attuned,saveBonus:1});
it.each([[true,true,8],[true,false,7],[false,true,7]])('includes an eligible protection item in automated INT saves (equipped %s, attuned %s)',async(equipped,attuned,expected)=>{
 characterReads({level:5,intelligence:18,saving_throw_proficiencies:['INT'],inventory:[ring(equipped,attuned)]});
 const result=await getTargetSaveBonus('participant','INT');expect(result.bonus).toBe(expected);
 if(equipped&&attuned)expect(result.breakdown).toContain('+ 1 (equipment)');else expect(result.breakdown).not.toContain('equipment');
});
it('combines an ability override with protection once, without treating combat buffs as equipment',async()=>{
 characterReads({level:5,intelligence:10,saving_throw_proficiencies:['INT'],inventory:[{magic_item_id:'headband-of-intellect',magical:true,equipped:true,attuned:true},ring(true,true)],active_buffs:[{name:'Bless',saveBonus:4}]});
 expect((await getTargetSaveBonus('participant','INT')).bonus).toBe(8);
});
it.each([[true,true,5],[true,false,4],[false,true,4]])('includes protection in the concentration offer (equipped %s, attuned %s)',async(equipped,attuned,bonus)=>{
 vi.mocked(createConcentrationOffer).mockClear();
 characterReads({id:'psion',level:5,constitution:12,concentration_spell:'Fly',concentration_revision:4,saving_throw_proficiencies:['CON'],inventory:[ring(equipped,attuned)]});
 await runConcentrationSave({campaignId:'campaign',encounterId:null,chainId:'chain',participantId:'participant',targetName:'Psion',damage:20});
 expect(createConcentrationOffer).toHaveBeenCalledWith(expect.objectContaining({bonus,dc:10}));
});
it('does not silently accept malformed equipment save values',async()=>{
 characterReads({level:5,intelligence:18,inventory:[{...ring(true,true),saveBonus:'unknown'}]});
 await expect(getTargetSaveBonus('participant','INT')).rejects.toThrow('Review equipment');
});

function creatureReads(creature:Record<string,unknown>){
 mocks.from.mockImplementation((table:string)=>{const result=()=>({data:table==='combat_participants'?{participant_type:'creature',entity_id:'creature',campaign_id:'campaign',combatant_id:'cb'}:table==='combatants'?{campaign_id:'campaign',definition_type:'homebrew_monster',definition_id:'creature'}:{...creature,campaign_id:'campaign'}});const q={select:()=>q,eq:()=>q,single:async()=>result(),maybeSingle:async()=>result()};return q;});
}
it.each([null,'', '5th','unknown'])('does not invent proficient creature PB from CR %s',cr=>{
 creatureReads({ability_scores:{int:18},save_proficiencies:['int'],cr});return expect(getTargetSaveBonus('participant','INT')).resolves.toMatchObject({confidence:'low'});
});
it.each([['INT',5,7],['intelligence',9,8],['int','1/2',6]])('uses normalized creature proficiency %s at CR %s',async(prof,cr,bonus)=>{
 creatureReads({ability_scores:{int:18},save_proficiencies:[prof],cr});expect(await getTargetSaveBonus('participant','INT')).toMatchObject({bonus,confidence:'high'});
});
it.each([NaN,Infinity,10.5])('does not pass malformed creature score %s to automation',async int=>{
 creatureReads({ability_scores:{int},save_proficiencies:[],cr:1});expect(await getTargetSaveBonus('participant','INT')).toMatchObject({confidence:'low'});
});
