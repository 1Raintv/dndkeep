/** UA Psion Update p.3: two choices at 2; one more at 5/10/13/17.
 * Every Psion level allows replacing at most one existing choice. */
export function getDisciplineCount(level:number):number {
 if(!Number.isInteger(level)||level<2||level>20)return 0;
 return 2+[5,10,13,17].filter(threshold=>level>=threshold).length;
}
/** Callers resolve legacy names to canonical IDs before validating. */
export function validDisciplineLevelUp(level:number,current:readonly string[],selected:readonly string[]):boolean {
 const count=getDisciplineCount(level),next=new Set(selected);
 return count>0 && selected.length===count && next.size===count
  && new Set(current.filter(id=>!next.has(id))).size<=1;
}
