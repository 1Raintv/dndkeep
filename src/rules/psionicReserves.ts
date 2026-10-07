/** v2.754 — Class levels are stored separately; total level is not eligibility. */
export function hasPsionicReserves(c:{class_name:string;level:number;secondary_class?:string|null;secondary_level?:number|null}):boolean {
  return (c.class_name==='Psion'&&c.level>=18)||(c.secondary_class==='Psion'&&(c.secondary_level??0)>=18);
}
