export type SpellGrantSource = `grant:class:${string}` | 'grant:species';
export type SpellSource = `class:${string}` | 'species' | 'feat' | 'other' | SpellGrantSource;
export type SpellSources = Record<string,readonly SpellSource[]>;

/** Empty/missing entries stay unknown. Validate before array operations so an
 * imported malformed record cannot crash the sheet or get silently rewritten. */
export function isSpellSources(value:unknown):value is SpellSources {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 return Object.entries(value).every(([id,sources])=>id.length>0&&Array.isArray(sources)&&sources.every(source=>
  typeof source==='string'&&(source==='feat'||source==='species'||source==='other'||source==='grant:species'||/^(?:grant:)?class:[A-Za-z](?:[A-Za-z -]*[A-Za-z])?$/.test(source))));
}


/** Undefined means unreviewed, never inferred ownership. Callers can retain
 * conservative legacy counts while excluding explicitly unrelated sources. */
export function spellSourceIncludesClass(sources:SpellSources,id:string,className:string):boolean|undefined {
 if(!Object.prototype.hasOwnProperty.call(sources,id)||!sources[id].length)return undefined;
 return sources[id].some(source=>source===`class:${className}`);
}


type SpellSourceEdit={ok:true;known:string[];sources:SpellSources}|{ok:false;reason:string};
/** Only learning through the selected class supplies a new ownership claim. */
export function learnClassSpell(known:readonly string[],sources:SpellSources,id:string,className:string):SpellSourceEdit {
 const owner=`class:${className}` as SpellSource;
 if(!isSpellSources(sources)||!isSpellSources({[id]:[owner]}))return {ok:false,reason:'Check spell sources before adding a spell.'};
 if(known.includes(id)&&spellSourceIncludesClass(sources,id,className)!==false)return {ok:false,reason:'This spell is already selected or its sources need review.'};
 return {ok:true,known:[...new Set([...known,id])],sources:{...sources,[id]:[...new Set([...(sources[id]??[]),owner])]}};
}
/** Removing one class's choice must preserve every independently learned copy.
 * An explicit manual removal of an unreviewed legacy entry keeps old behavior. */
export function forgetClassSpell(known:readonly string[],sources:SpellSources,id:string,className:string):SpellSourceEdit {
 if(!isSpellSources(sources))return {ok:false,reason:'Check spell sources before removing a spell.'};
 if(spellSourceIncludesClass(sources,id,className)===false)return {ok:false,reason:'This spell belongs to another class or feature.'};
 const remaining=(sources[id]??[]).filter(source=>source!==`class:${className}`);
 const next={...sources};if(remaining.length)next[id]=remaining;else delete next[id];
 return {ok:true,known:remaining.length?[...new Set(known)]:[...new Set(known.filter(spell=>spell!==id))],sources:next};
}
