import {describe,expect,it} from 'vitest';
import {classCastingAbility,classSpellCastingOptions,selectClassCastingOption,spellCastingNumbers,type CastingClass} from './spellCasting';
const classes:CastingClass[]=[{name:'Cleric',level:11,ability:'wisdom'},{name:'Psion',level:5,ability:'intelligence'}];
const input={id:'spell',spellLevel:1,classes,sources:{spell:['class:Psion']},preparationSources:{spell:['class:Psion']},prepared:['spell']};
describe('source-aware casting',()=>{
 it('uses Psion Intelligence in either class order',()=>{
  for(const order of [classes,[...classes].reverse()]){
   const result=classSpellCastingOptions({...input,classes:order});
   expect(selectClassCastingOption(result.options)?.ability).toBe('intelligence');
   expect(spellCastingNumbers('intelligence',{intelligence:4,wisdom:1,charisma:-1},5)).toEqual({ability:'intelligence',modifier:4,attack:9,saveDC:17});
  }
 });
 it('requires an explicit source for independently prepared copies',()=>{
  const sources={spell:['class:Psion','class:Cleric']};
  const result=classSpellCastingOptions({...input,sources,preparationSources:sources});
  expect(selectClassCastingOption(result.options)).toBeNull();
  expect(selectClassCastingOption(result.options,'Cleric')?.ability).toBe('wisdom');
  expect(selectClassCastingOption(result.options,'Wizard')).toBeNull();
 });
 it('excludes the unprepared copy and does not silently reuse stale selection',()=>{
  const result=classSpellCastingOptions({...input,sources:{spell:['class:Psion','class:Cleric']}});
  expect(result.options.map(o=>o.className)).toEqual(['Psion']);
  expect(selectClassCastingOption(result.options,'Cleric')).toBeNull();
 });
 it('requires source review for legacy ownership or ambiguous preparation',()=>{
  for(const sources of [{},{spell:[]},{spell:'class:Psion'}])expect(classSpellCastingOptions({...input,sources}).needsSourceReview).toBe(true);
  expect(classSpellCastingOptions({...input,sources:{spell:['class:Psion','class:Cleric']},preparationSources:{}})).toMatchObject({options:[],needsSourceReview:true});
 });
 it('cantrips do not require preparation but still require casting-source choice',()=>{
  const result=classSpellCastingOptions({...input,spellLevel:0,prepared:[],preparationSources:{spell:[]},sources:{spell:['class:Psion','class:Cleric']}});
  expect(result.options).toHaveLength(2);expect(selectClassCastingOption(result.options)).toBeNull();
 });
 it('grants stay available, with only one option for the same class',()=>{
  const result=classSpellCastingOptions({...input,prepared:[],preparationSources:{spell:[]},sources:{spell:['class:Psion','grant:class:Psion']}});
  expect(result.options).toHaveLength(1);expect(result.options[0].className).toBe('Psion');
 });
 it('retains independently known grants while legacy preparation needs review',()=>{
  const result=classSpellCastingOptions({...input,preparationSources:{},sources:{spell:['class:Psion','class:Cleric','grant:class:Psion']}});
  expect(result.needsSourceReview).toBe(true);expect(result.options.map(o=>o.className)).toEqual(['Psion']);
 });
 it('does not invent class abilities for species, feats, absent or noncasting classes',()=>{
  const sources={spell:['species','feat','other','class:Fighter','class:Wizard']};
  const result=classSpellCastingOptions({...input,spellLevel:0,classes:[...classes,{name:'Fighter',level:2,ability:null}],sources});
  expect(result.options).toEqual([]);expect(result.unresolvedSources).toEqual(sources.spell);
 });
 it('rejects malformed preparedness and zero-level classes',()=>{
  expect(classSpellCastingOptions({...input,preparationSources:{spell:'class:Psion'}}).needsSourceReview).toBe(true);
  expect(classSpellCastingOptions({...input,classes:[{name:'Psion',level:0,ability:'intelligence'}]}).options).toEqual([]);
 });
 it('preserves negative modifiers and rejects invalid effective numbers',()=>{
  expect(spellCastingNumbers('charisma',{intelligence:4,wisdom:1,charisma:-1},2)).toMatchObject({modifier:-1,attack:1,saveDC:9});
  expect(spellCastingNumbers('wisdom',{intelligence:4,wisdom:NaN,charisma:-1},2)).toBeNull();
  expect(spellCastingNumbers('intelligence',{intelligence:4,wisdom:1,charisma:-1},0)).toBeNull();
 });
});

it('keeps noncasters and locked subclasses from supplying a made-up spell ability',()=>{
 expect(classCastingAbility('Psion',null,1)).toBe('intelligence');
 expect(classCastingAbility('Cleric',null,1)).toBe('wisdom');
 expect(classCastingAbility('Bard',null,1)).toBe('charisma');
 expect(classCastingAbility('Fighter','Champion',11)).toBeNull();
 expect(classCastingAbility('Fighter','Eldritch Knight',2)).toBeNull();
 expect(classCastingAbility('Fighter','Eldritch Knight',3)).toBe('intelligence');
 expect(classCastingAbility('Rogue','Arcane Trickster',3)).toBe('intelligence');
});
it('refuses invalid combined progression rather than granting a source',()=>{
 for(const invalid of [[...classes,{name:'Wizard',level:5,ability:'intelligence' as const}],[classes[1],classes[1]]])
  expect(classSpellCastingOptions({...input,classes:invalid})).toMatchObject({options:[],needsSourceReview:true});
});
