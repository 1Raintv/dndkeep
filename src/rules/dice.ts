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
