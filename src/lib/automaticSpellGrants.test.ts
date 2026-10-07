import {expect,it} from 'vitest';
import type {Character} from '../types';
import {automaticSpellGrantPatch,getAutomaticSpellGrants} from './automaticSpellGrants';
const pc={class_name:'Psion',level:2,subclass:'',species:'Tiefling',species_choices:{tieflingLegacy:'infernal'},secondary_class:'Paladin',secondary_level:3,known_spells:[],prepared_spells:[]} as unknown as Character;
it('uses total species level and independent class levels',()=>{
 expect(getAutomaticSpellGrants(pc)).toEqual(expect.arrayContaining([{id:'mage-hand',source:'grant:class:Psion',prepared:false},{id:'divine-smite',source:'grant:class:Paladin',prepared:true},{id:'darkness',source:'grant:species',prepared:true}]));
});
it('persists grants once without repeated save patches',()=>{
 const patch=automaticSpellGrantPatch(pc);
 expect(patch.spell_sources?.['mage-hand']).toEqual(['grant:class:Psion']);
 expect(patch.prepared_spells).not.toContain('mage-hand');
 expect(automaticSpellGrantPatch({...pc,...patch})).toEqual({});
});
it('removes expired species grants while keeping independently learned copies',()=>{
 const before={...pc,...automaticSpellGrantPatch(pc)};
 before.spell_sources={...before.spell_sources,darkness:['class:Psion','grant:species']};
 const patch=automaticSpellGrantPatch({...before,species:'Human'});
 expect(patch.known_spells).toContain('darkness');
 expect(patch.spell_sources?.darkness).toEqual(['class:Psion']);
 expect(patch.prepared_spells).not.toContain('darkness');
});
it('does not prune unknown legacy spells based only on subclass list membership',()=>{
 const patch=automaticSpellGrantPatch({...pc,species:'Human',subclass:'Psi Warper',known_spells:['teleport'],prepared_spells:['teleport']});
 expect(patch.known_spells).toContain('teleport');
 expect(patch.spell_sources?.teleport).toBeUndefined();
});

it.each(['',null,undefined])('ignores orphaned secondary level when class is %s',secondary_class=>{
 const grants=getAutomaticSpellGrants({...pc,secondary_class,secondary_level:3} as Character);
 expect(grants.filter(grant=>grant.source==='grant:species').map(grant=>grant.id)).not.toContain('darkness');
 expect(grants.map(grant=>grant.id)).not.toContain('hellish-rebuke');
 expect(grants.map(grant=>grant.id)).not.toContain('divine-smite');
 expect(grants.map(grant=>grant.id)).toContain('mage-hand');
});
it.each([null,undefined,-1,0,2.5,NaN])('ignores invalid secondary level %s for every grant',secondary_level=>{
 const grants=getAutomaticSpellGrants({...pc,secondary_level} as Character);
 expect(grants.map(grant=>grant.id)).not.toContain('hellish-rebuke');
 expect(grants.map(grant=>grant.id)).not.toContain('divine-smite');
 expect(grants.map(grant=>grant.id)).toContain('mage-hand');
});
