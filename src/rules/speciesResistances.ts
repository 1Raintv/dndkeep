// v2.848: SRD 5.2.1 Fiendish Legacy grants the chosen resistance; Goliath
// ancestry does not grant blanket Cold resistance. Missing choices stay unknown.
export function speciesResistances(species: string, choices?: Record<string, string> | null): string[] {
 const name=species.trim().toLowerCase();
 if(name==='tiefling'){
  const legacy=choices?.tieflingLegacy;
  return legacy==='abyssal'?['poison']:legacy==='chthonic'?['necrotic']:legacy==='infernal'?['fire']:[];
 }
 if(name==='dwarf')return ['poison'];
 // Preserve the existing supported non-SRD Yuan-ti rule.
 if(name==='yuan-ti'||name==='yuanti')return ['poison'];
 return [];
}

/** Frozen pre-v2.848 rules, ONLY to validate existing saved requests for recovery.
 * New previews must never use these outdated defaults. */
export function legacySavedSpeciesResistances(species:string):string[]{
 const name=species.toLowerCase(),result:string[]=[];
 for(const [key,type] of [['tiefling','fire'],['dwarf','poison'],['goliath','cold'],['yuanti','poison'],['yuan-ti','poison']]){
  if(name.includes(key))result.push(type);
 }
 return result;
}
