/** v2.843: preserve qualifiers verbatim. A conditional defense is not an
 * unconditional type, and an old unrecorded field does not prove no defense. */
export function normalizeCreatureDefenses(value:unknown):string[]|null {
 if(value==null)return null;
 if(!Array.isArray(value)||!value.every(v=>typeof v==='string'))throw new Error('Damage defenses must be a list of text entries.');
 const seen=new Set<string>();return value.map(v=>v.trim()).filter(v=>{
  const key=v.toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;
 });
}
