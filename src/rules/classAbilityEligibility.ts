/** v2.751 — Class catalogs may contain subclass-only actions. */
export function canUseClassAbility(
  ability: { minLevel: number; requiredSubclass?: string },
  character: { level: number; subclass?: string | null },
): boolean {
  return character.level >= ability.minLevel &&
    (!ability.requiredSubclass || character.subclass === ability.requiredSubclass);
}
