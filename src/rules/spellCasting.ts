import {isSpellSources,type SpellSource} from './spellSources';

export type CastingAbility='intelligence'|'wisdom'|'charisma';
/** Noncasters have no default spell ability; subclass casting starts at level 3. */
export function classCastingAbility(name:string,subclass:string|null|undefined,level:number):CastingAbility|null {
 if(!Number.isInteger(level)||level<1||level>20)return null;
 if(['Wizard','Artificer','Psion'].includes(name))return 'intelligence';
 if(['Cleric','Druid','Ranger'].includes(name))return 'wisdom';
 if(['Paladin','Bard','Sorcerer','Warlock'].includes(name))return 'charisma';
 if(level>=3&&(name==='Fighter'&&subclass==='Eldritch Knight'||name==='Rogue'&&subclass==='Arcane Trickster'))return 'intelligence';
 return null;
}
export interface CastingClass {name:string;level:number;ability:CastingAbility|null}
export interface ClassCastingOption {source:SpellSource;className:string;ability:CastingAbility}
/** v2.794 — Each prepared spell uses its source class's casting ability (2024 SRD,
 * Multiclassing). Catalog/progression lookup stays outside this pure layer.
 * A shared spell requires a choice even when both abilities happen to match:
 * source-specific features still differ. Never infer ownership from a spell list. */
export function classSpellCastingOptions(input:{id:string;spellLevel:number;classes:readonly CastingClass[];sources:unknown;preparationSources:unknown;prepared:readonly string[]}):{options:ClassCastingOption[];needsSourceReview:boolean;unresolvedSources:SpellSource[]} {
 const {id,spellLevel,classes,sources,preparationSources,prepared}=input;
 if(!classes.length||classes.some(c=>!Number.isInteger(c.level)||c.level<1||c.level>20)
  ||new Set(classes.map(c=>c.name)).size!==classes.length||classes.reduce((sum,c)=>sum+c.level,0)>20)
  return {options:[],needsSourceReview:true,unresolvedSources:[]};
 if(!isSpellSources(sources)||!isSpellSources(preparationSources)||!sources[id]?.length)
  return {options:[],needsSourceReview:true,unresolvedSources:[]};
 const options:ClassCastingOption[]=[];const unresolvedSources:SpellSource[]=[];
 const reviewed=Object.prototype.hasOwnProperty.call(preparationSources,id);
 const needsSourceReview=spellLevel>0&&!reviewed&&prepared.includes(id)&&sources[id].filter(source=>!source.startsWith('grant:')).length>1;
 for(const source of [...new Set(sources[id])]){
  const granted=source.startsWith('grant:');
  const ready=spellLevel===0||granted||(reviewed?preparationSources[id].includes(source):prepared.includes(id));
  if(!ready||needsSourceReview&&!granted)continue;
  const className=source.replace(/^(?:grant:)?class:/,'');
  const cls=source.includes('class:')?classes.find(c=>c.name===className&&Number.isInteger(c.level)&&c.level>0):undefined;
  if(!cls?.ability){unresolvedSources.push(source);continue;}
  // Learned and automatically granted copies from one class share a casting source.
  if(!options.some(option=>option.className===className))options.push({source,className,ability:cls.ability});
 }
 // Global legacy preparedness cannot disambiguate independently owned copies.
 return {options,needsSourceReview,unresolvedSources};
}
/** A stale selection cannot fall through to another class after rest/review. */
export function selectClassCastingOption(options:readonly ClassCastingOption[],selectedClass?:string):ClassCastingOption|null {
 if(selectedClass)return options.find(option=>option.className===selectedClass)??null;
 return options.length===1?options[0]:null;
}
/** Inputs are effective modifiers and total-level proficiency, never raw scores. */
export function spellCastingNumbers(ability:CastingAbility,modifiers:Record<CastingAbility,number>,proficiency:number){
 const modifier=modifiers[ability];
 if(!Number.isInteger(modifier)||!Number.isInteger(proficiency)||proficiency<2||proficiency>6)return null;
 return {ability,modifier,attack:modifier+proficiency,saveDC:8+modifier+proficiency};
}
