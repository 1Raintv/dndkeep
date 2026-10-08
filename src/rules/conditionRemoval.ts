// v2.847: derived incapacity lasts while ANY parent remains. Falling Prone is
// a lasting consequence of Unconscious, not an effect that ends with it (SRD 5.2.1).
export const CONDITION_CASCADES: Record<string, readonly string[]> = {
  Unconscious: ['Prone', 'Incapacitated'],
  Paralyzed: ['Incapacitated'],
  Stunned: ['Incapacitated'],
  Petrified: ['Incapacitated'],
};
export interface ConditionSource { source?: string; [key: string]: unknown }
export function removeConditions(
  conditions: readonly string[], sources: Readonly<Record<string, ConditionSource>>,
  requested: readonly string[],
): { conditions: string[]; sources: Record<string, ConditionSource>; removed: string[] } {
  const removed = new Set(requested.filter(name => conditions.includes(name)));
  const nextSources = { ...sources };
  const remainingParent = conditions.find(name => !removed.has(name) &&
    CONDITION_CASCADES[name]?.includes('Incapacitated'));
  for (const name of conditions) {
    const source = sources[name]?.source;
    const parentRemoved = typeof source === 'string' && source.startsWith('cascade:') && removed.has(source.slice(8));
    // v2.860: Unconscious requires Prone throughout, not only on application.
    if (name === 'Prone' && conditions.includes('Unconscious') && !removed.has('Unconscious') && removed.has(name)) {
      removed.delete(name);
      nextSources[name] = { source: 'cascade:Unconscious' };
    } else if (name === 'Incapacitated' && remainingParent && (removed.has(name) || parentRemoved)) {
      removed.delete(name);
      nextSources[name] = { source: `cascade:${remainingParent}` };
    } else if (!removed.has(name) && parentRemoved) {
      if (name === 'Prone' && source === 'cascade:Unconscious') {
        // Discard inherited saves/expiry/caster data: waking does not stand you up.
        nextSources[name] = { source: 'fall:Unconscious' };
      } else removed.add(name);
    }
  }
  for (const name of removed) delete nextSources[name];
  return { conditions: conditions.filter(name => !removed.has(name)), sources: nextSources, removed: [...removed] };
}
