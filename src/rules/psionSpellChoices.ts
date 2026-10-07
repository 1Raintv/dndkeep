/** UA Psion Update pp.2–3: spell choices use Psion progression, not
 * multiclass slot totals or manually edited slot counters. */
export function maximumPsionSpellLevel(level:number):number {
 return Number.isInteger(level)&&level>=1&&level<=20?Math.min(9,Math.ceil(level/2)):0;
}
