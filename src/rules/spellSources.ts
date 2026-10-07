export type SpellSource = `class:${string}` | 'species' | 'feat' | 'other';
export type SpellSources = Record<string,readonly SpellSource[]>;

/** Empty/missing entries stay unknown. Validate before array operations so an
 * imported malformed record cannot crash the sheet or get silently rewritten. */
export function isSpellSources(value:unknown):value is SpellSources {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 return Object.entries(value).every(([id,sources])=>id.length>0&&Array.isArray(sources)&&sources.every(source=>
  typeof source==='string'&&(source==='feat'||source==='species'||source==='other'||/^class:[A-Za-z](?:[A-Za-z -]*[A-Za-z])?$/.test(source))));
}
