/** v2.762 — attacks in the Attack action on your turn, not bonus/reaction
 * attacks. SRD 5.2.1 class progression + multiclass non-stacking; private
 * Metamorph progression from the owner-provided UA update, p.8.
 * Conditional weapon invocations and temporary effects are not inferred here. */
export interface AttackProgression {
  class_name: string;
  level: number;
  subclass?: string | null;
  secondary_class?: string | null;
  secondary_level?: number | null;
  secondary_subclass?: string | null;
}

function classAttacks(name: string | null | undefined, level: number | null | undefined, subclass?: string | null): number {
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 20) return 1;
  const klass = name?.trim().toLowerCase();
  if (klass === 'fighter') return level >= 20 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  if (['barbarian', 'monk', 'paladin', 'ranger'].includes(klass ?? '')) return level >= 5 ? 2 : 1;
  if (klass === 'psion' && subclass === 'Metamorph') return level >= 6 ? 2 : 1;
  return 1;
}

export function attacksPerAction(character: AttackProgression): number {
  // Character.level is the primary CLASS level. Never add secondary levels to
  // unlock Extra Attack, and never add two classes' Extra Attack benefits.
  return Math.max(
    classAttacks(character.class_name, character.level, character.subclass),
    classAttacks(character.secondary_class, character.secondary_level, character.secondary_subclass),
  );
}
