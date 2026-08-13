# Psion — which UA version wins

The Psion is private homebrew content in this repo: RLS-scoped to Jared's
account, `source: 'ua'`, and deliberately excluded from the RAW regression
suite (`npm run raw-check`), which covers published 2024 rules only.

There are two source PDFs, both Unearthed Arcana 2025:

| File | Role |
|---|---|
| `UA2025-ThePsion-v1.pdf` | The original, complete class. **The baseline.** |
| `UA2025-Psion+Update-v2.pdf` | An **update** to it, not a reprint. |

## The rule (decided 2026-08-12)

> **v2 is a patch on v1, not a replacement for it.**
>
> - Anything v2 **covers**, v2 wins — its version replaces v1's.
> - Anything v2 **does not mention** is simply unchanged, and v1 still
>   governs it. Absence from v2 is *not* deletion.

This matters because v2 is a short document. Read as a standalone class it
looks like it removes most of the Psion; read as a patch — which is what it
is — it changes a handful of things and leaves the rest standing.

**Before flagging Psion content as "drift", ask which case it is.** An audit
that treats v2 as the whole class will generate a pile of false positives.
That is exactly what happened in the v2.659 pass, and it is why this file
exists.

## Settled questions

### Psi Warper is valid content — do not remove it

v2 says three subclasses "return with changes: Metamorph, Psykinetic, and
Telepath". That sentence names which subclasses were **revised**; it is not
an exhaustive roster of the class's subclasses. Psi Warper was not revised,
so v1's version of it stands unchanged.

This was previously logged as drift and came within one commit of being
deleted. It is not drift.

**Note the argument does not depend on anyone using it.** When this was
decided there were two production Psion characters on Psi Warper, and that
made deleting it costly — but the reason it stays is that it is still valid
content, not that removing it would have hurt. Both of those characters have
since been deleted (2026-08-12, starting the Psion fresh) and **production now
has zero Psion characters**, which changes nothing here. Anyone re-opening
this should argue the v1/v2 relationship above, not the character count.

`classes.ts` already carries the marker: *"(Passed UA v1 playtest
unchanged.)"*

### Steel Wind Strike keeps its `Psion` tag

`spells.ts` tags Steel Wind Strike `classes: ["Psion", "Ranger", "Wizard"]`,
and Psi Warper's `spell_list` grants it at level 9. It is not on v2's *base*
Psion spell list — but the base list and a subclass grant are different
things, and the subclass granting it is live v1 content. The tag stays.

### Psionic Restoration follows v2 (fixed in v2.660)

This one *is* covered by v2, so v2 wins:

| Source | Text |
|---|---|
| v1 | Short Rest; regain no more than half your **number of dice** (round down) |
| **v2** | **1-minute meditation; regain ALL expended dice; once per Long Rest** |
| Ours, pre-v2.660 | "half your Psion **level** (rounded up)" — matched neither |

The old text was invented, and worse, the data disagreed with itself:
`classFeatures.ts` already carried the v2 wording while `classResources.ts`
carried the invented one. All three files now state the v2 rule
(`classResources.ts`, `classFeatures.ts`, `levelProgression.ts`).

Note this was a genuine **power increase**, not a transcription fix, and was
approved as such.

## Corrected in v2.659

Each of these is a case where v2 *does* cover the material, so v2 won:

- **Phantom subclass feature at level 11.** v2 grants subclass features at
  3/6/10/14. No Psion subclass defines anything at 11; the creator was
  prompting for a choice with nothing behind it.
- **Telepath's spell list** was still v1's. v2 replaced the level-5 pick
  (Speak with Plants → Slow) and the level-9 pick (Awaken → Yolande's Regal
  Presence).
- **Sanctuary (L1) and Abi-Dalzim's Horrid Wilting (L8)** are on v2's Psion
  list — both called out in its "new spells" note — but weren't tagged.
- **Animate Dead** was tagged for Psion. It is on v1's list and absent from
  v2's — and v2 reprints the base spell list in full, so this absence *is* a
  removal under the rule above. Untagged. (At the time, neither live Psion
  character had it known or prepared.)
- **Level 19 offered an ASI.** v2's level-4 text reads "You gain this feature
  again at Psion levels 8, 12, and 16", so ASIs are 4/8/12/16 and 19 is the
  Epic Boon.
- **The once-per-turn Discipline limit** was recorded nowhere, despite two
  disciplines (Psionic Guards, Sharpened Mind) carrying explicit exceptions
  to it.

## Verified correct — not worth re-checking

Core traits; cantrips (2/3/4 at levels 1/4/10); prepared spells; spell
slots; Psionic Energy Dice progression; Psionic Discipline counts (2 at L2,
+1 at 5/10/13/17); all 11 disciplines' mechanics; the 12-cantrip list; and
Metamorph and Psykinetic features and spell lists.

## Working notes

- Psion is **invisible to the seeded local test account** — it is RLS-scoped
  to Jared's real account. Anything Psion-specific must be verified against
  production data, not the local Docker stack.
- **Production has no Psion characters as of 2026-08-12**, so there is
  currently nothing live to verify a Psion change against. Roll a fresh one
  first rather than concluding from an empty result set that something is
  broken.
- Extracting the PDFs: `pdftotext` ships with Git for Windows. Use it
  **without** `-layout` for the spell tables (the columns flow correctly)
  and **with** `-layout` for the features table.
- Track 1 (rules data) is human-gated: verify, propose, let Jared decide.
  Never auto-edit rules data — see `docs/ROADMAP.md`.
