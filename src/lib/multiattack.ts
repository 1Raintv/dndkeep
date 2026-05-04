// v2.416.0 — Multiattack description parser.
//
// Monster `Multiattack` actions have free-text desc fields like:
//   "The tarrasque makes 5 attacks: one with its bite, two with its
//    claws, one with its horns, and one with its tail."
//
// We need to turn that into a SEQUENCE of (attack-action-name, count)
// pairs that the UI can step through one at a time, picking targets
// per step and decrementing a counter as each completes.
//
// The parser is intentionally permissive — bestiary text is not
// machine-clean. We strip articles ("its", "his", "her"), handle
// number words ("one", "two", "three", ..., or numerals), and
// match each attack name token against the actual list of actions
// the monster has so we don't accidentally synthesize an attack
// that doesn't exist on the stat block.

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/**
 * Parse a multiattack desc into a sequence of step descriptors.
 *
 * @param desc           Raw description text.
 * @param availableNames Names of all actions on the monster's stat
 *                       block (case-insensitive). Used to validate
 *                       that each parsed step maps to a real action.
 * @returns Sequence of `{ actionName, count }` in the desc's stated
 *          order. Empty array when parsing fails — caller falls back
 *          to "free pick" mode (any attack, decrementing
 *          attacks_remaining as before).
 */
export interface MultiattackStep {
  actionName: string;   // canonical name from availableNames
  count: number;        // how many times the monster repeats this attack
}

export function parseMultiattackDesc(
  desc: string | null | undefined,
  availableNames: string[],
): MultiattackStep[] {
  if (!desc) return [];
  const normAvailable = availableNames.map(n => ({ orig: n, norm: normalizeName(n) }));

  // Strip leading boilerplate up to the first colon when present —
  // "The tarrasque makes 5 attacks: ..." lets us focus on what
  // follows the colon.
  const after = desc.includes(':') ? desc.slice(desc.indexOf(':') + 1) : desc;

  // Split on commas / "and" / semicolons. The result might still have
  // leading filler ("one with its") which we strip below.
  const pieces = after.split(/,| and |;/i).map(s => s.trim()).filter(Boolean);

  const steps: MultiattackStep[] = [];
  for (const raw of pieces) {
    // Match "<count> with its <noun>" OR just "<count> <noun> attacks"
    // OR "<count> <noun> attack" — case-insensitive.
    const cleaned = raw.replace(/\b(its|his|her|their|the)\b/gi, ' ').replace(/\s+/g, ' ').trim();

    // Try numerator: leading "one"/"two"/.../number, then strip.
    const numMatch = cleaned.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+/i);
    let count = 1;
    let body = cleaned;
    if (numMatch) {
      const tok = numMatch[1].toLowerCase();
      count = /^\d+$/.test(tok) ? parseInt(tok, 10) : (NUMBER_WORDS[tok] ?? 1);
      body = cleaned.slice(numMatch[0].length).trim();
    }

    // Strip "with" / "uses" / "attack(s)" filler at the boundaries.
    body = body
      .replace(/^(with|uses|using|of)\s+/i, '')
      .replace(/\s+(attacks?|attack)\s*$/i, '')
      .trim();

    if (!body) continue;
    const bodyNorm = normalizeName(body);

    // Find the best matching action name: try exact, then containment
    // either direction (so "bite" matches "Bite (Melee)", and
    // "Tail Sweep" matches a desc piece "tail").
    let matched: { orig: string; norm: string } | undefined =
      normAvailable.find(a => a.norm === bodyNorm);
    if (!matched) {
      matched = normAvailable.find(a => a.norm.includes(bodyNorm));
    }
    if (!matched) {
      matched = normAvailable.find(a => bodyNorm.includes(a.norm));
    }
    if (!matched) continue;
    steps.push({ actionName: matched.orig, count });
  }
  return steps;
}
