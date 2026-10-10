// src/rules/dice.ts — pure dice-rolling rules.
//
// This is the first module of the `rules/` layer: pure game-rule functions
// with ZERO imports (no components, no supabase, no data tables). Keeping it
// a leaf module matters for bundle size — anything that imports from
// lib/gameUtils transitively pulls in the full spell/class/item data tables
// (~655 KB). Components that only need dice should import from here instead.
//
// This module is the single source of truth for dice parsing/rolling.
// lib/gameUtils, lib/buffs, and lib/pendingAttack re-export or delegate to
// these functions so their existing import sites keep working. Two parsers
// intentionally remain elsewhere because their grammar is different:
//   - lib/healSpells.ts resolveHealDice — supports the "+MOD" token
//     (spellcasting-modifier placeholder in heal expressions)
//   - lib/hooks/useWeaponStrike.ts — multi-group expressions ("1d8+1d6")
//     with the flat bonus tracked separately from the dice string

/** Roll a single die of a given number of sides. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// Parses dice expressions like "2d8+3" or "1d6" and returns the individual
// rolls + modifier. Falls back to { rolls: [], modifier: 0, total: 0 } on
// parse failure. (Moved verbatim from lib/pendingAttack.ts — the most
// complete of the app's dice parsers.)
export function rollDiceExpr(expr: string): { rolls: number[]; modifier: number; total: number } {
  // v2.448.0 — Bare-integer support. Some bestiary entries (Crab,
  // Weasel, etc. — 19 tiny creatures total) record damage as a
  // literal "1" because the SRD says "Hit: 1 piercing damage" with
  // no dice expression. Treat a bare positive integer as a constant
  // total: zero rolls, modifier=N, total=N. Rolls go in the modifier
  // (not the rolls array) because there's no random component to
  // animate. Pre-v2.448 these returned total=0 — the attack would
  // hit and deal nothing.
  const bareInt = /^\s*(\d+)\s*$/.exec(expr);
  if (bareInt) {
    const n = parseInt(bareInt[1], 10);
    return { rolls: [], modifier: n, total: n };
  }
  const m = /^\s*(\d+)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return { rolls: [], modifier: 0, total: 0 };
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
  return { rolls, modifier: mod, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

// On a crit, double the dice (not the modifier) per 2024 PHB.
// "3d8+2" → "6d8+2". Unparseable expressions pass through unchanged.
export function doubleDice(expr: string): string {
  const m = /^\s*(\d+)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return expr;
  const count = parseInt(m[1], 10) * 2;
  const sides = m[2];
  const mod = m[3] ? m[3].replace(/\s+/g, '') : '';
  return `${count}d${sides}${mod}`;
}

export interface DiceGroupPlan {sides:number[];modifier:number}
export interface DiceGroupResult {dice:{die:number;value:number}[];modifier:number;total:number}
/** v2.869 — one parser for rolling and validating saved evidence. Parsing never
 * consumes random dice, so invalid expressions fail before a save is rolled. */
export function parseDiceGroups(expression:string):DiceGroupPlan|null {
 const text=expression.replace(/\s+/g,'');
 if(!/^(?:\d+d\d+|\d+)(?:[+](?:\d+d\d+|\d+)|-\d+)*$/i.test(text))return null;
 const parts=text.match(/[+-]?[^+-]+/g)!;
 const sides:number[]=[];let modifier=0;
 for(const part of parts){
  const m=/^\+?(\d+)d(\d+)$/i.exec(part);
  if(m){
   const count=Number(m[1]),die=Number(m[2]);
   if(count<1||count>100||die<1||die>1000)return null;
   sides.push(...Array<number>(count).fill(die));
  }else{
   const flat=Number(part);if(!Number.isSafeInteger(flat))return null;
   modifier+=flat;if(!Number.isSafeInteger(modifier))return null;
  }
 }
 if(!Number.isSafeInteger(modifier+sides.length)||!Number.isSafeInteger(sides.reduce((sum,die)=>sum+die,modifier)))return null;
 return {sides,modifier};
}
/** Retain each die's size and every flat modifier for spell animations. */
export function rollDiceGroups(expression:string):DiceGroupResult|null {
 const plan=parseDiceGroups(expression);if(!plan)return null;
 const dice=plan.sides.map(die=>({die,value:rollDie(die)}));
 return {dice,modifier:plan.modifier,total:dice.reduce((sum,d)=>sum+d.value,plan.modifier)};
}
/** Validate a saved roll against its expression without rolling replacements. */
export function validDiceGroups(expression:string,value:unknown):value is DiceGroupResult {
 const plan=parseDiceGroups(expression),r=value as DiceGroupResult|null;
 return !!plan&&!!r&&r.modifier===plan.modifier&&Number.isSafeInteger(r.total)&&Array.isArray(r.dice)
  &&r.dice.length===plan.sides.length&&r.dice.every((d,i)=>d&&d.die===plan.sides[i]&&Number.isInteger(d.value)&&d.value>=1&&d.value<=d.die)
  &&r.total===r.dice.reduce((sum,d)=>sum+d.value,plan.modifier);
}
/** Fold the bonus into an existing flat modifier so combat's NdX parser agrees. */
export function addDiceModifier(expression:string,bonus:number):string {
 if(!bonus)return expression;
 const m=/^(\d+d\d+)([+-]\d+)?$/i.exec(expression.replace(/\s+/g,''));
 if(!m)return expression;
 const total=Number(m[2]??0)+bonus;
 return m[1]+(total>0?'+'+total:total<0?String(total):'');
}

export interface PhysicalDiceEvent {
 dieType:number;result:number;allDice?:{die:number;value:number}[];
 advantage?:boolean;disadvantage?:boolean;modifier?:number;flatBonus?:number;
}
/** v2.818 — flags must create real dice, not only an Advantage label. */
export function physicalDiceList(event:PhysicalDiceEvent):{die:number;value:number}[]{
 const list=(event.allDice?.length?event.allDice:[{die:event.dieType,value:event.result}]).map(d=>({...d}));
 if(event.dieType!==20||(!event.advantage&&!event.disadvantage))return list;
 const first=list.findIndex(d=>d.die===20);if(first<0)return list;
 if(event.advantage&&event.disadvantage)return list.filter((d,i)=>d.die!==20||i===first);
 if(list.filter(d=>d.die===20).length===1)list.splice(first+1,0,{die:20,value:0});
 return list;
}
/** Use the settled physical faces. Bonus dice still add normally; Advantage
 * selects one d20, and its discarded partner remains available for history. */
export function physicalDiceOutcome(event:PhysicalDiceEvent,dice:{die:number;value:number}[]):{total:number;discarded:number[]}{
 const d20=dice.map((d,i)=>({d,i})).filter(({d})=>d.die===20);
 let discarded:number[]=[];
 if(event.dieType===20&&(event.advantage||event.disadvantage)&&d20.length){
  let kept=d20[0];
  if(!(event.advantage&&event.disadvantage))for(const candidate of d20.slice(1)){
   if(event.advantage?candidate.d.value>kept.d.value:candidate.d.value<kept.d.value)kept=candidate;
  }
  discarded=d20.filter(({i})=>i!==kept.i).map(({i})=>i);
 }
 return {total:dice.reduce((sum,d,i)=>sum+(discarded.includes(i)?0:d.value),0)+(event.modifier??0)+(event.flatBonus??0),discarded};
}
