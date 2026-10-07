import {expect,it} from 'vitest';
import type {Character} from '../types';
import {canAddKnownSpell,canPrepareSpell,getSpellCounts} from './spellLimits';
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
