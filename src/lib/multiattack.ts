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

  // v2.442.0 — Detect "uses its <Action>" / "can use its <Action>" /
  // "uses <Action>" patterns BEFORE the colon (or anywhere in the
  // desc when there's no colon split). Pre-v2.442 the colon strip
  // dropped everything to the left, so the Ancient White Dragon's
  // multiattack — "The dragon can use its Frightful Presence. It
  // then makes three attacks: one with its bite and two with its
  // claws." — silently lost the Frightful Presence step. We now
  // scan the head of the desc for verbs like "uses its", "use its",
  // "uses", "use", followed by a name we recognize from the action
  // list, and prepend each match as a count=1 step. Patterns with
  // explicit numbers ("uses 2 of its X") take their number; the
  // default is 1 (single use of the named ability).
  //
  // The scan only looks at the desc text up to the first colon (if
  // any) — the post-colon section is handled by the existing
  // "X attacks: ..." parser below. This avoids double-counting an
  // ability that appears in both halves (rare, but we guard against
  // it by deduping at the end).
  const head = desc.includes(':') ? desc.slice(0, desc.indexOf(':')) : desc;
  const prefixSteps: MultiattackStep[] = [];
  // Match "(can )?uses?(s)? (X )?(of )?(its|his|her|their|the )?<Name>"
  // where <Name> is greedy enough to grab multi-word ability names
  // like "Frightful Presence". We anchor on the verb form so we
  // don't accidentally match "It then makes three attacks" — that
  // path goes to the colon-split handler.
  // We extract candidate names by walking each "uses (its )?" verb
  // occurrence and reading forward until punctuation or sentence-
  // boundary words ("then", "and then", "if", "before").
  const verbRe = /\b(?:can\s+)?(?:use|uses|using)\s+(?:its\s+|his\s+|her\s+|their\s+|the\s+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = verbRe.exec(head)) !== null) {
    const start = verbRe.lastIndex;
    // Capture up to ~80 chars or sentence boundary, whichever comes
    // first. This is an upper bound — we'll match against
    // availableNames below, so excess text doesn't matter for
    // correctness, only for matcher efficiency.
    const tail = head.slice(start, start + 80);
    // Stop at strong sentence boundaries: ". ", "; ", ", then",
    // " then ", " and then ", " before ".
    const stopRe = /\.\s|;\s|,\s+then\b|\s+then\b|\s+and\s+then\b|\s+before\b/i;
    const stopMatch = tail.match(stopRe);
    const candidate = stopMatch ? tail.slice(0, stopMatch.index) : tail;
    const candNorm = normalizeName(candidate);
    if (!candNorm) continue;
    // Find the longest action-name that appears IN the candidate
    // text (not the other way around — the candidate may have
    // trailing words). Prefer longest match so "Frightful Presence"
    // beats a hypothetical "Presence".
    let best: { orig: string; norm: string } | undefined;
    for (const a of normAvailable) {
      if (!a.norm) continue;
      if (candNorm.startsWith(a.norm) || candNorm.includes(' ' + a.norm) || candNorm === a.norm) {
        if (!best || a.norm.length > best.norm.length) best = a;
      }
    }
    if (!best) continue;
    // Skip self-references — the multiattack action's own name
    // shouldn't loop back into itself. Caller passes availableNames
    // including "Multiattack" but the desc shouldn't be treating it
    // as a step.
    if (best.norm === 'multiattack') continue;
    prefixSteps.push({ actionName: best.orig, count: 1 });
  }

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
  // v2.442.0 — Concatenate prefix steps (e.g. "uses its Frightful
  // Presence") in front of the main attack list, deduping any name
  // that already appeared in the main list (defensive — desc text
  // shouldn't say "uses its bite" then "1 with its bite" but we
  // guard against double-counting just in case).
  if (prefixSteps.length === 0) return steps;
  const mainNames = new Set(steps.map(s => s.actionName.toLowerCase()));
  const dedupedPrefix = prefixSteps.filter(s => !mainNames.has(s.actionName.toLowerCase()));
  return [...dedupedPrefix, ...steps];
}
