import {expect,it} from 'vitest';
import type {Character} from '../types';
import {canAddKnownSpell,canPrepareSpell,getSpellCounts,getClassPreparedSpellIds} from './spellLimits';
const psion={class_name:'Psion',level:1,known_spells:[],prepared_spells:[],spell_slots:{'1':{total:2,used:0}},intelligence:16} as unknown as Character;
it('rejects preparing off-list or unavailable imported spells',()=>{
 expect(canPrepareSpell({...psion,known_spells:['fireball']},'fireball').allowed).toBe(false);
 expect(canPrepareSpell({...psion,known_spells:['telekinesis']},'telekinesis').allowed).toBe(false);
 expect(canPrepareSpell(psion,'charm-person').allowed).toBe(false);
 expect(canPrepareSpell({...psion,known_spells:['charm-person']},'charm-person').allowed).toBe(true);
});
it('does not turn multiclass or edited high slots into higher-level Psion choices',()=>{
 const c={...psion,secondary_class:'Wizard',secondary_level:16,spell_slots:{'9':{total:1,used:0}},known_spells:['telekinesis']};
 expect(canPrepareSpell(c,'telekinesis').allowed).toBe(false);
 expect(canAddKnownSpell({...c,known_spells:[]},'telekinesis').allowed).toBe(false);
});
it('permits the newly unlocked spell level even with every slot expended',()=>{
 const c={...psion,level:9,known_spells:['telekinesis'],spell_slots:{'5':{total:1,used:1}}};
 expect(canPrepareSpell(c,'telekinesis').allowed).toBe(true);
 expect(canAddKnownSpell({...c,known_spells:[]},'telekinesis').allowed).toBe(true);
});
it('preserves off-list Psi Warper grants without using the prepared cap',()=>{
 const c={...psion,level:9,subclass:'Psi Warper'};
 expect(canPrepareSpell(c,'steel-wind-strike').allowed).toBe(true);
 expect(canAddKnownSpell(c,'steel-wind-strike').allowed).toBe(true);
 expect(canPrepareSpell({...c,level:8},'steel-wind-strike').allowed).toBe(false);
 expect(getSpellCounts({...c,known_spells:['steel-wind-strike'],prepared_spells:['steel-wind-strike']}).prepared).toBe(0);
});
it('does not consume a chosen cantrip slot for the granted Mage Hand',()=>{
 expect(canAddKnownSpell({...psion,known_spells:['mind-sliver','minor-illusion']},'mage-hand').allowed).toBe(true);
});

it('counts only this class’s explicit sources and counts shared spells once',()=>{
 const c={...psion,level:5,known_spells:['mage-armor','mage-armor','hold-person','minor-illusion','mind-sliver'],prepared_spells:['mage-armor','mage-armor','hold-person'],
  spell_sources:{'mage-armor':['class:Psion'],'hold-person':['class:Wizard'],'minor-illusion':['feat'],'mind-sliver':['class:Psion','class:Wizard']}} as Character;
 expect(getSpellCounts(c)).toMatchObject({known:1,prepared:1,cantrips:1});
 expect(getSpellCounts({...c,class_name:'Wizard'})).toMatchObject({known:1,prepared:1,cantrips:1});
});
it('retains conservative counts for unknown sources without changing the source map',()=>{
 const sources={'mage-armor':[]} as Character['spell_sources'];
 const c={...psion,known_spells:['mage-armor','charm-person'],prepared_spells:['mage-armor'],spell_sources:sources};
 expect(getSpellCounts(c)).toMatchObject({known:2,prepared:1});
 expect(sources).toEqual({'mage-armor':[]});
});
it('an unrelated class or feat does not fill the Psion cantrip allowance',()=>{
 const c={...psion,known_spells:['mind-sliver','minor-illusion'],spell_sources:{'mind-sliver':['class:Wizard'],'minor-illusion':['feat']}} as Character;
 expect(canAddKnownSpell(c,'telekinetic-fling').allowed).toBe(true);
 expect(getSpellCounts(c).cantrips).toBe(0);
});

it('can learn an eligible spell already known through Wizard, but cannot learn it twice through Psion',()=>{
 const c={...psion,known_spells:['mage-armor'],spell_sources:{'mage-armor':['class:Wizard']}} as Character;
 expect(canAddKnownSpell(c,'mage-armor').allowed).toBe(true);
 expect(canAddKnownSpell({...c,spell_sources:{'mage-armor':['class:Wizard','class:Psion']}},'mage-armor').allowed).toBe(false);
});

it('counts readiness by class even when both classes learned the spell',()=>{
 const c={...psion,known_spells:['mage-armor'],prepared_spells:['mage-armor'],spell_sources:{'mage-armor':['class:Psion','class:Wizard']},spell_preparation_sources:{'mage-armor':['class:Wizard']}} as Character;
 expect(getSpellCounts(c)).toMatchObject({known:1,prepared:0});
 expect(getClassPreparedSpellIds(c)).toEqual([]);
 expect(getSpellCounts({...c,class_name:'Wizard'}).prepared).toBe(1);
 expect(canPrepareSpell(c,'mage-armor').allowed).toBe(true);
});
it('an explicit empty readiness entry overrides a stale global prepared entry',()=>{
 const c={...psion,known_spells:['mage-armor'],prepared_spells:['mage-armor'],spell_preparation_sources:{'mage-armor':[]}};
 expect(getSpellCounts(c).prepared).toBe(0);
});
it('does not prepare a spell owned only by another class',()=>{
 expect(canPrepareSpell({...psion,known_spells:['mage-armor'],spell_sources:{'mage-armor':['class:Wizard']}},'mage-armor').allowed).toBe(false);
});
