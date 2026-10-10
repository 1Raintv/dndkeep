/** SRD 5.2.1, Multiclassing: proficiency uses total character level. */
export function proficiencyBonus(level:number):number {
 const valid=Number.isFinite(level)?Math.trunc(level):1;
 return Math.ceil(Math.max(1,Math.min(20,valid))/4)+1;
}
export function characterProficiencyBonus(character:{level:number;secondary_class?:string|null;secondary_level?:number|null}):number {
 const primary=Number.isFinite(character.level)?Math.max(1,Math.trunc(character.level)):1;
 const secondary=character.secondary_class&&Number.isInteger(character.secondary_level)&&character.secondary_level!>0?character.secondary_level!:0;
 return proficiencyBonus(primary+secondary);
}

/** v2.253.0 — Convert an NPC/monster CR string to its proficiency
 *  bonus per the 2024 PHB / DMG monster-CR table. Accepts the CR
 *  shape used in dm_npc_roster and the monsters table: '0', '1/8',
 *  '1/4', '1/2', '1', '2', ..., '30'. Falls back to PB 2 (CR 0–4)
 *  for unknown / unparseable input — that's the most common bracket
 *  and the safest default for an NPC the DM forgot to set CR on.
 *
 *  Reference (CR → PB):
 *   0–4 → 2,   5–8 → 3,   9–12 → 4,   13–16 → 5,
 *  17–20 → 6, 21–24 → 7, 25–28 → 8,  29+   → 9.
 */
export function crToProficiencyBonus(cr: string | number | null | undefined): number {
  if (cr == null) return 2;
  // Fractional CRs (1/8, 1/4, 1/2) all sit in the 0–4 bracket → PB 2.
  if (typeof cr === 'string' && cr.includes('/')) return 2;
  const n = typeof cr === 'number' ? cr : parseFloat(cr);
  if (!Number.isFinite(n)) return 2;
  if (n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
}
