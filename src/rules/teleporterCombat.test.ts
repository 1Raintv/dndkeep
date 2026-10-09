import {expect,it} from 'vitest';
import {teleporterCantripEligible} from './teleporterCombat';
const character={class_name:'Psion',level:6,subclass:'Psi Warper'};
const spell={id:'light',level:0,casting_time:'1 Action'};
it('requires Psion level six, including secondary Psion, rather than total level',()=>{
 expect(teleporterCantripEligible(character,spell,'class:Psion')).toBe(true);
 expect(teleporterCantripEligible({...character,level:5,secondary_class:'Fighter',secondary_level:1},spell,'class:Psion')).toBe(false);
 expect(teleporterCantripEligible({class_name:'Fighter',level:1,secondary_class:'Psion',secondary_level:6,secondary_subclass:'Psi Warper'},spell,'class:Psion')).toBe(true);
 expect(teleporterCantripEligible({...character,subclass:'Psi Warrior'},spell,'class:Psion')).toBe(false);
});
it.each(['1 minute','1 hour','1 Bonus Action','Reaction','2 Actions','Special','Action or Bonus Action',''])('excludes %s from the one-Action follow-up',casting_time=>expect(teleporterCantripEligible(character,{...spell,casting_time},'class:Psion')).toBe(false));
it('requires a cantrip and the chosen Psion casting source',()=>{
 expect(teleporterCantripEligible(character,{...spell,level:1},'class:Psion')).toBe(false);
 for(const source of ['class:Wizard','species','feat','other'])expect(teleporterCantripEligible(character,spell,source)).toBe(false);
 expect(teleporterCantripEligible(character,spell,'grant:class:Psion')).toBe(true);
});

it('rejects stale Produce Flame metadata until its separate cast/throw flow is repaired',()=>expect(teleporterCantripEligible(character,{...spell,id:'produce-flame'},'class:Psion')).toBe(false));
