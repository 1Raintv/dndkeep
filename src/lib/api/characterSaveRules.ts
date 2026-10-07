import { supabase } from '../supabase';
/** Existing character preference defaults on; inaccessible/missing targets use RAW. */
export async function getCharacterSaveNaturalExtremes(characterId: string): Promise<boolean> {
  const { data, error } = await supabase.from('characters').select('nat_1_20_saves').eq('id', characterId).maybeSingle();
  if (error) throw error;
  return !!data && data.nat_1_20_saves !== false;
}
