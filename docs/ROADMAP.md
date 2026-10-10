# DNDKeep — Two-Track Roadmap

### Save-resolution audit checkpoint (local branch; not released)

Canonical `creature` targets now receive the existing Legendary Resistance
choice after a failed save, alongside legacy `monster`/`npc` targets. A failed
resistance read stops resolution instead of silently skipping the choice.
Save events also classify these creatures correctly. Desktop/mobile browser
checks verify the real resistance prompt, blocked damage while awaiting the
choice, successful resistance, and one charge spent. Screenshots inspected;
full verification passes, with the TypeScript baseline lowered from 198 to 197.
Code checkpoint: `9d7b4b8`. No production deployment in this checkpoint.

Remaining audit findings: Mind Sliver's next-save penalty is not automated;
it needs one-use consumption and correct expiry across saving-throw paths.
Legendary Resistance acceptance still uses legacy separate writes and needs
an atomic concurrency review. This fix does not claim those paths are complete.

### In progress — Shared action budget (Propel connected locally; not released)

`src/rules/actionBudget.ts` defines action declarations against verified grants,
immutable request identities and the actor's own-turn epoch. One Bonus Action
covers either Propel variant regardless of save outcome. A historical replay
returns the original claim without spending today's grant. Reactions remain
spent across other creatures' turns. Haste grants only its listed actions and
one attack; Action Surge cannot fund Magic or become another Bonus Action.
Spell action types now reuse the shared type rather than defining another.

Rules checked against the 2024 [Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game),
[Fighter](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes), and
[Haste](https://www.dndbeyond.com/spells/2619141-haste) references. The module is a
pure transaction contract, not an authorization boundary or completed feature.
No ability yet calls its planner; no production budget changes in this checkpoint.
The 33 focused cases and full gate pass: 2,914 units / 260 files, TypeScript
199/199, clean hooks/RAW/coordinates/anchors, build and 255.2 KB entry.
Changed rule modules lint clean.

Teleporter Combat origin checkpoint (local only):
`20261009164359_teleporter_combat_windows.sql` records qualifying free Misty
Step casts atomically with their payment and Bonus Action. It snapshots Psion
level (including secondary Psion), excludes pre-level-6 casts even if retried
after leveling, and rejects old-turn or subsequent-action origins. An identity
sequence orders same-transaction actions; transaction timestamps cannot do so.
The table and inspection helper are private and grant no casting permission.
All 55 action-context SQL cases pass, including six new origin cases; the full
release gate passes. No player UI or production behavior changed here.

The subsequent `20261009192652_teleporter_combat_cantrip_claims.sql` checkpoint
consumes one free-Misty-Step origin with the child spell declaration. The child
uses its parent's Bonus Action receipt without another normal Action claim.
The consumed record survives pending-cast pruning; exact retries replay and
concurrent choices cannot consume it twice. A private built-in cantrip ID list
rejects relabeled leveled spells and long castings; the client request builder
captures parent, source and target for recovery. Neither picker nor live UI is
connected yet. The server still requires the stored Psion ownership source.
Custom cantrips are unsupported until trusted metadata can be validated.
Verification: 104 action-context/spell-settlement SQL cases pass, plus the full
release gate (3,001 unit tests, TypeScript 198/198, 255.2 KB entry). Changed
TypeScript files lint clean; SQL lint reports no issues in the changed functions.
Anon/authenticated cannot directly read or insert child records.


Catalog audit corrected [Mending](https://www.dndbeyond.com/spells/2619033-mending)
from one Action to one minute. [Produce Flame](https://www.dndbeyond.com/spells/2618901-produce-flame)
also has stale casting metadata: its 2024 Bonus Action creates the flame, and a
separate Magic action throws it. Both are excluded from Teleporter follow-ups;
Produce Flame's cast/throw flow still needs repair before changing its metadata.
A parity test protects the private ID list against catalog drift.

`20261009193638_teleporter_combat_slotted_origins.sql` now captures slotted
Misty Step at declaration and activates the follow-up on successful settlement.
Eligibility is captured before leveling/retries, including multiclass Psi
Warper casting Misty Step through another class. Later turns or subsequent
shared Actions expire it; reactions while resolving the parent are permitted.
A countered parent remains explicitly `interrupted` and cannot automatically
fund a child. The owner/DM-scoped recovery endpoint exposes waiting, ready and
interrupted records for both free and slotted casts. The TypeScript reader
rejects malformed or contradictory receipts and preserves read failures.
Verification: all 112 action-context/spell-settlement SQL cases pass, including
interrupted and saved-through parent casts. Full gate passes with 3,016 units,
198 TypeScript baseline and 255.2 KB entry; changed TS and SQL functions lint
clean. The recovery facade is invoker and unavailable to anonymous callers.


The local Teleporter Combat row now opens a recovered cantrip picker. It filters
confirmed Psion sources and exact one-Action cantrips, preserves the parent in
saved requests, and connects utility and single-target damage paths to the
existing declaration/target/recovery flow. Failed availability reads remove
casting choices; character switches ignore stale responses. Mage Hand and Mind
Sliver have desktop/mobile browser coverage with a real parent/child record,
unchanged normal Action and saved target after reload. The skill overflow probe
passes on the changed dialog, and screenshots were inspected. Removing the
parent link made the browser test fail (expected one child, received zero);
the exact source was restored. Full gate passes with 3,022 unit tests,
TypeScript 198/198 and 255.2 KB entry. All 16 desktop/mobile Propel and
damaging-spell recovery cases pass after restoring the mutation.

True Strike, area/multi-attack cantrips, healing and non-damaging saves display
an explicit manual-resolution limitation without spending a cast. Solo and
interrupted parents also remain explicit limitations. These paths still need
their actual resolution flow before the feature can be called complete.

Still required for Teleporter Combat: finish weapon/area/save-only/solo follow-up
resolution, decide the interrupted-parent rule, and cover intervening legacy
activity before release. Local `public.spells` contains 32 rows and no level-0 rows:
do not depend on it as a complete cantrip catalog or trust client-supplied spell
level. `spellActionKind` includes long castings' initial Actions and cannot be
used as this feature's eligibility test. Origin inspection currently observes
shared claims only; legacy action writers must also be covered before release.
These checkpoints are not deployed and do not complete the feature.
The verified 2024 Counterspell source is
https://www.dndbeyond.com/spells/2619072-counterspell (not legacy spell 2051).
It describes interruption, loss of effect and the casting action, and preserves
the slot. Whether the separate Teleporter Combat trigger follows an interrupted
Misty Step still needs an explicit rules interpretation; do not infer it from
slot reimbursement.


Local database checkpoints (not deployed):

- `20261009144010_shared_action_turn_context.sql` reuses the existing
  `psionic_turn_starts` observer. Its separate action epoch changes only on an
  actual turn-context change, not rest/effect-expiry updates. Actor selection is
  shared with Psion effects and skips dead combatants. The earlier unshipped
  duplicate clock implementation was removed from the migration and local DB.
- `20261009144534_shared_action_claims.sql` adds private action claims and extra
  grants. Character locks serialize competing tabs; exact retries return the
  original claim even on later turns. Normal budgets respect existing combat
  flags. Haste/Action Surge grants retain restrictions, and action/resource
  changes roll back together when composed in one transaction.

All 18 new SQL cases and 96 existing Psion discipline/turn/Sharpened cases pass.
The full release gate also passes (2,914 units, 199 TypeScript baseline, 255.2 KB
entry). New SQL cases cover concurrency, replay, rollback, off-turn reactions,
incapacitation, legacy flags, extra-grant restrictions, dead-actor selection,
solo turns and direct caller privileges. Changed functions lint clean and local
advisors have no findings naming the new/changed objects. These are private
composition helpers, not public action or feature APIs. Extra-grant activation,
all feature/target verification, non-incapacitation reaction restrictions,
immutable power rolls/targets, saved recovery and player UI integration remain.
No production action-budget behavior has changed. The stale-dialog release
v2.869 is independently verified live.

`20261009145709_psionic_propel_declarations.sql` adds the private Propel
lifecycle: declaration claims the Bonus Action and freezes mode, movement,
base die, caster snapshot and target. Paid Enkindled/Surge receipts attach to
that declaration; roll finalization prevents later enhancement edits. A failed
save spends one Energy Die for powered use; passed/cancelled uses spend none.
Cancellation retains the action and any already-paid Hit Dice. A failed payment
leaves the same pending result recoverable, and cursor paging exposes all
unfinished declarations after browser storage is lost. Warp remains 30 feet
from the caster, independent of the roll, and adds no condition.

Target membership and self-targeting are checked in combat. Actual size, sight
and range still require explicit tabletop confirmation; no map token moves.
Verification: all 28 local action/Propel SQL cases pass (26 lifecycle cases
plus two multiclass/Warp number checks); full gate passes with 2,914 unit tests.
SQL lint and local advisors have no findings for the Propel objects.

Recovery UI, saved-DC presentation and all action-writer integration remain
unfinished. The underlying lifecycle helpers remain private; the next migration
adds the scoped feature facade. No production changes have been applied. This checkpoint does not reserve an Energy Die while a save is
pending; a concurrent spend can defer final payment, which must be recovered
without a new action/roll. Review this workflow before enabling it for players.

`20261009150703_psionic_propel_api.sql` adds one authenticated, owner/DM-checked
Propel facade. Generic action/grant helpers remain inaccessible to app roles.
The client API validates declaration identity, Bonus Action receipt, frozen dice,
conditional costs and recovery cursors before acknowledging a result. Existing
Surge/Enkindled payment and recovery paths now support a single Propel parent;
a request cannot name multiple feature parents. The authenticated local flow
passes through begin, read/list, finalize and finish; another owner is denied.
The player controls are now connected on this working branch; these migrations remain local.
Verification: full gate passes (2,933 units / 261 files, TypeScript 199/199,
255.2 KB entry); the additional Surge retry/parent-substitution test also passes.
Authenticated SQL flow passes; SQL lint/advisors report no Propel findings.

Recovery continuation now reads paid Enkindled dice and Surge status from the
scoped Propel API before offering choices. `continuePropel` retains the saved
base/extras, skips already-paid enhancements, blocks unknown payment receipts,
and freezes old-turn rolls without offering new costs. The local database test
confirms both enhancements are readable before finalization without mutating it.
Full gate: 2,945 units / 262 files, TypeScript 199/199, entry 255.2 KB;
changed modules lint clean and SQL lint has no Propel findings. The controls below
now call this continuation; this is not a deployed UI change.

Propel player controls are connected in `ClassAbilitiesSection` (including
secondary Psions using the real character, not the projected class row). Full gate
passes: 2,953 units / 264 files, TypeScript 199/199, 255.2 KB entry. Target
selection/legality confirmation precedes the declaration and roll. The declared
caster snapshot supplies the save DC; exact begin/outcome requests persist before
sending, and server paging exposes unfinished uses after reload. Closing keeps a
use pending; cancellation keeps the action and paid Hit Dice. Energy receipts
are acknowledged without a second write. Desktop/mobile browser checks passed
for target selection, declaration, reload recovery and conditional die cost;
the saved-DC regression fails when deliberately changed to use current stats.
Screenshots inspected; dialog-scoped skill overflow checks clean. Whole-sheet
probe still reports pre-existing +/- button and Free Misty Step label clipping.

Release work still required:
update the older Propel E2E selectors/turn assumptions, cover combat
recovery and enhancement flows in-browser, and connect every other action
writer before treating the shared budget as enforced. Map movement and target
size/sight/range remain manual. No release/version bump for this working branch.

Combat save assistance is connected to the saved declaration. The existing
save resolver accepts a bound encounter/target, disables target substitution,
and refuses automatic resolution if that encounter or participant disappeared.
The declared DC is retained; existing save bonuses, natural-extremes house rule,
willing failures and Psionic Guards handling are reused. Solo/combat stored-turn
formats are validated separately. No save is inferred when the dialog closes.
Four local browser cases pass (solo reload + combat rolled save, desktop/mobile),
with clean console/network and inspected screenshots. Full gate passed with
2,956 unit tests, 199 TypeScript errors at baseline, and 255.2 KB entry; five
additional malformed-turn cases pass in the focused 44-test rerun. The bound
selection test fails under deliberate target-filter removal, then passes restored.
The shared budget still does not feed every action writer or its UI indicators.

`20261009154619_psionic_propel_history.sql` (local only) now saves confirmed
save evidence, conditional payment, outcome and one action-log entry in the same
transaction. Exact repeated/concurrent confirmations share the entry and cost;
a log-write failure rolls both outcome and cost back. The saved request retains
target, DC, every save die, kept die, bonus, total, advantage and the natural-
extremes preference. Arithmetic/outcome checks reject contradictory evidence;
manual/willing results do not invent dice. History also identifies original power
dice, resolved total, Enkindled extras, Surge and manual movement limits.
Five targeted SQL checks pass (evidence replay, rejection, log rollback,
concurrency and private-helper grants); four desktop/mobile browser cases also
pass and verify combat evidence/history. Full gate: 2,973 units / 265 files,
199 TypeScript baseline, 255.2 KB entry; two later receipt/storage tests pass in
the focused 40-test run. New SQL objects have no lint/advisor findings and changed
client modules lint clean. The migration has been applied/recorded locally only.

Save dice are still provisional until confirmation; confirmed outcome requests
survive reload in browser storage. If final payment cannot commit, the server
keeps the declaration unfinished and the browser retains that exact outcome.
Recovery after losing that browser state before successful commit remains a
case to harden, along with all shared action writers and visible action flags.

Remaining implementation and required evidence:

- Server derives grants, turn ownership, conditions and feature eligibility;
  clients cannot invent an Action Surge/Haste grant or claim Magic is a feature.
  Serialize competing claims, immutable receipts, resource costs and declaration
  history in one transaction. Prove duplicate/concurrent/reload behavior in SQL.
- Track an actor's own-turn epoch separately from the global encounter nonce.
  Existing `psionic_turn_context_internal` returns the global nonce even off-turn;
  using it alone would wrongly refill reactions on each opponent's turn.
- Give Propel a persisted declaration/roll/target identity before the save and
  enhancements. Finish the same request after pass/fail; do not refund action
  for a passed save or recover against a different turn. Save and recover pending
  work after reload. Preserve paid enhancement receipts on cancellation.
- Replace local-only sheet toggles and integrate paid/free/manual spell actions,
  class powers, attack sequences, Dash/Disengage, reactions and turn transitions.
  `movement.takeDash` currently writes participant flags separately; spell
  receipts restore local flags but do not enforce this shared budget.
- Preserve explicit corrections, Action Surge/Haste restrictions and attack
  subcounts, solo play, additional actors, Ready/reaction timing, permission
  boundaries and simultaneous-tab use. Verify complete desktop/phone flows.



`20261009155514_shared_action_budget_read.sql` (local only) exposes an
owner/DM-checked read of saved normal-action claims plus existing combat flags.
The sheet now retains the recorded Used state after reload, prevents local undo
of saved spending, and refreshes on confirmed turn changes. Failed reads retain
last confirmed spending; late responses cannot update another character. Level-1
Psions also advance the solo turn counter. Movement +/- controls no longer clip.
Desktop/mobile reload and End Turn checks pass, including the scoped UI overflow
probe and inspected screenshots. The saved-spending regression fails when that
state is deliberately removed. Full gate: 2,985 units / 267 files; TypeScript
baseline reduced to 198; entry stays 255.2 KB. The shared claims still need to
write combat flags and cover other action writers atomically before release.

`20261009160851_shared_action_combat_flags.sql` (local only) mirrors normal
Bonus Actions, reactions and non-Attack actions into combat flags in the claim
transaction. Stale flag resets retain current claims; the next actual own-turn
epoch clears mirrored spending, including reactions before the first observed
turn. Replays cannot mark the new turn spent, cancellations keep their claim,
and failed transactions roll flags back. Extra grants and Attack sequence
counters remain separate. All 39 prior/current SQL cases passed, followed by
six targeted refresh cases (including the new first-turn case); four browser
flows and two privilege checks passed across desktop/mobile. Full code gate
passes (2,985 units, 198 TypeScript baseline, 255.2 KB entry); changed functions
lint clean. Spell/attack/other legacy writers still need atomic integration.

`20261009161444_shared_spell_action_claims.sql` (local only) reserves a normal
casting action in the same transaction as the paid declaration, including
cantrips. Missing/invalid action types, off-turn normal actions and conflicting
Propel/spell spending roll back the declaration and slot together. Retries retain
the original claim; Counterspell refunds only the slot, not the action. Casting
locks now order character/encounter/participant consistently with Propel while
retaining cast/advisory locks for settlement/cancellation. Verified declarations
notify the sheet to refresh saved action indicators.
Four targeted SQL cases, 22 delivery cases, two final missing-action/refund
checks and four desktop/mobile Mind Spike/Witch Bolt recovery flows pass. Full
gate: 2,986 units / 267 files, 198 TypeScript baseline, 255.2 KB entry. Changed
functions lint clean. The spell-slot fixtures now use explicit casting actions,
real own-turn progression and separate Action/Bonus Action/Reaction budgets. All
46 settlement cases pass, plus two added rollback checks proving a rejected cast
leaves neither a claim nor a spent combat flag. Counterspell test setup no longer
resets reactions on every acceptance; refresh happens only during turn advance.
The full gate remains green. Remaining before release: free/manual casting,
extra-action eligibility, and server verification of declared casting metadata.
The existing slot-per-turn limit remains distinct from the shared action budget.

`20261009162438_shared_counterspell_reaction.sql` (local only) reserves the
Counterspell reaction in the same transaction as its slot, save and acceptance.
Stale flag resets cannot restore it; the next own turn refreshes it, and old
acceptance replays do not spend the refreshed reaction. Lock order now matches
other action spending after cast/offer serialization. The client refreshes its
saved-action indicator only after validating the acceptance receipt.
All 86 Counterspell/payment/delivery SQL regressions pass, including competing
reaction requests, rollback and later-turn replay. Four desktop/mobile browser
cases confirm source selection, lost-response retries and Reaction Used after
reload. Full gate passes: 2,987 units / 267 files, TypeScript 198/198, 255.2 KB
entry; changed functions lint clean. Still a working branch, not deployed.

`20261009163045_shared_misty_step_action.sql` (local only) composes free
Psi Warper Misty Step with the shared Bonus Action in its existing resource
transaction. Paid/manual restoration restores only the feature use, never the
Bonus Action. Replays do not spend a later turn; failed writes roll back both
trackers. It spends no spell slot, so an Action spell remains available under
the separate slot rule. The existing payment-recovery event refreshes the sheet.
Five focused SQL cases and the full 15-case energy ledger suite plus the
free-cast/Action-spell combination pass. Six desktop/mobile Propel/Misty Step
flows verify spending and reload persistence. Full gate remains green (2,987
units, 198 TypeScript baseline, 255.2 KB entry); new function lint clean.
Audit follow-up: Teleporter Combat is present in feature descriptions, but a
source search found no dedicated automation for its attached Psion cantrip.
Verify and implement that exception before calling Psi Warper automation complete.
Manual destination/visibility validation and other free/solo casts remain.

Psi Warper description audit: verified the original UA p.8 against the Update
p.7 carry-forward note. Warp Space, Teleporter Combat, Duplicitous Target and
Mass Teleportation now share one complete description across the sheet and
creation data, removing duplicate prose and unsupported restrictions/outcomes.
Source: [original UA](https://media.dndbeyond.com/compendium-images/ua/the-psion/mXCPWlh2yy5tBKqP/UA2025-ThePsion.pdf).
These remain private UA references, not SRD content. Full gate passes (2,988
units, 198 TypeScript baseline, 255.2 KB entry). Desktop/mobile rendering and
scoped overflow checks pass; screenshots inspected. Removing a required target
condition makes the new browser regression fail. Teleporter Combat's attached
cantrip remains unimplemented; this checkpoint corrects reference data only.

### v2.869 — Pending Psion rolls keep their original context

Power confirmations now invalidate when the character, campaign, Psion
progression, power type or Warp choice changes, including changing away and
back. Previously an open Surge prompt could spend a Hit Die for an obsolete
power, and Connection could call the replacement power's callback. Five new
regressions failed before the fix. Ordinary HP/resource updates still work;
live eligibility/payment checks continue to govern those changes.

Verification: 17 power-component cases, including seven new regressions; full
release gate passes (2,881 unit tests, TypeScript 199/199, clean hooks, RAW,
coordinates, anchors, build and 255.2 KB entry budget). Changed files lint clean.

v2.868 is independently verified live (production service worker 2.868.0).
The next action-budget implementation must cover spells, class powers and
manual controls together. Current spell action receipts restore UI flags but
are not a shared server-enforced action budget. Propel also needs a saved
begin/finish identity: action consumed at declaration, die cost only on failed
save, immutable roll/target, cancellation policy, replay and later-turn recovery.
Do not charge an action only after a failed save, refund it on a passed save,
or let an old resolution mark a new turn's Bonus Action. Target size, range,
sight and map placement remain separate unresolved requirements.


### v2.868 — Propel action and resolution corrections

Telekinetic Propel and Warp Propel are adjacent Bonus Action entries. Both expose
an explicit Energy Die roll; Warp also offers its no-die teleport through the same
single-target Strength-save flow instead of the old generic Special button.
Powered uses spend one Energy Die only after a failed save. Warp destinations
remain unoccupied, visible, within 30 feet of the caster and horizontal to the
caster; a higher roll does not extend that limit or add Prone. Map placement,
visibility, size and range verification remain manual; this is not automatic
forced movement. The supplied Psion text is the rule reference.

Focused rules/component and desktop/phone tests cover Bonus Action labels,
adjacency, subclass/level eligibility and actual conditional pool changes.
The browser regression rejects the old Special label. Continue the ability audit
with action cost, target restrictions, optional die choices, failure/success costs,
cancel/retry behavior and manual-versus-automatic effects reviewed together.
The broader weapon transaction remains on `codex/weapon-damage-resolution`.


### v2.867 — Psychic saving spells use Sharpened damage resolution

New paid single-target Psychic saving spells use the guarded damage preview and
atomic HP, life state, concentration, history and receipt settlement. Their saved
casting source distinguishes Psion resistance bypass from other-class psychic
spells, which can still use optional Attack Mode. A replacement changes the
original damage roll before the successful save reduction and target defenses.
Zero damage after defenses cannot trigger replacement. Paid caster/target/source
and saved dice are verified again on application. Lost replies reuse one receipt
and one current-turn replacement use.

The spell source marker is populated from new paid declarations; legacy records
are not guessed. Weapons, attack-roll spells, shared/mixed-type damage still need
complete handling of mastery, retaliation and per-type defenses. This is a real
saving-spell integration, not completion of broader Sharpened damage automation.
Migration: `20261008211300_psychic_save_resolution.sql` (local applied).
Verification: 63 SQL cases, ten desktop/phone flows including real Mind Spike
replacement and lost-application replay; scoped overflow checks pass. Desktop/phone
screenshots inspected. The browser regression fails when restored to the old
Destructive-Thoughts-only UI. Full gate: 2,870 units / 259 files, TypeScript 199/199,
hooks/RAW/coordinates/anchors, production build and 255.2 KB entry. Database lint
reports no errors or findings on changed functions; unrelated standing warnings
remain. Publication pending.

### v2.866 — Preserve melee/ranged attack delivery

New declared attack spells capture melee/ranged delivery separately from their
spell source. Weapon rows, explicit monster action headers, opportunity attacks,
Cleave and multi-beam spells also supply their known delivery mode. Attack bonuses,
damage riders, server damage validation and melee retaliation use that value.
A ranged spell no longer inherits melee-only bonuses just because its source is
`spell`. Paid spell replay preserves the original delivery mode; invalid modes
and modes on saving-throw declarations are rejected before payment.

Legacy attacks without a recorded mode retain their previous behavior. Ambiguous
weapon/action wording is not guessed. This is a prerequisite for broader typed
Psion damage; it does not make ordinary damage settlement atomic or complete all
legacy attack writers. Migration: `20261008210210_spell_attack_mode.sql`.
Verification: 50 SQL cases and four desktop/phone paid-spell recovery flows pass,
including reload and lost delivery replies. Full gate passes: 2,857 units / 258
files, TypeScript 199/199, hooks/RAW/coordinates/anchors, build and 255.2 KB entry.
Desktop/phone casting screenshots and scoped overflow checks pass. Database lint
has no errors; existing warnings remain, including the unchanged loop variable
in record_pending_damage. Merged PR #210 after both CI gates passed. Production
migration run 37844293132 succeeded; ledger/column/functions verified and advisor
counts unchanged (6 security / 4 performance). Vercel frontend rate-limited;
v2.861.0 independently confirmed live.

### v2.865 — Consistent Psychic damage application

The direct Destructive Thoughts application endpoint previously ignored recorded
Psychic defenses and Sharpened Mind; a resistant target took 13 instead of 6 in
the reproduced case. It now enters the same locked resolution used by the DM
preview. Immunity, resistance, vulnerability and active Sharpened bypass agree
across callers. Unknown defenses require a DM decision. Default application never
chooses or spends the optional Attack Mode replacement. Receipt probes remain
read-only; committed winners return before reading changed targets or turns.

Migration: `20261008204710_psionic_application_defense_parity.sql` (local applied).
Verification: 33 SQL cases and six desktop/phone Psion damage flows pass,
including lost replies, preserved dice, Surge and optional Sharpened replacement.
The resistance regression fails before the fix (13 instead of 6). Full gate passes:
2,838 units / 257 files, TypeScript 199/199, hooks/RAW/coordinates/anchors, build
and 255.2 KB entry. Database lint has no errors or findings on the changed function;
existing warnings remain in unrelated functions. Merged PR #209 after both CI
gates passed. Production migration run 37842181581 succeeded; ledger and function
permissions independently verified, advisor counts unchanged (6 security / 4
performance). Frontend deployment remains Vercel rate-limited; v2.861.0 confirmed live.
This closes a prerequisite bypass; ordinary
psychic spells and weapons still require broader typed-damage integration and
atomic settlement, including mastery and melee retaliation.

### v2.864 — Responsive combat initiative strip

Combat controls use the available width below the monster rail, with 44px primary
buttons, a scrollable participant list and responsive rows. Fullscreen removes
the hidden sidebar gutter; short landscape uses one row to preserve map height.
The Fast Combat Rolls checkbox no longer inherits full-width text-input styling.
Map clearance regression now checks primary button visibility, hit testing, touch
size, strip height, rotation and real saved move/undo/redo. Rail transitions settle
before checking Fit map geometry. Both desktop/phone map flows and both combat
lifecycle flows pass (real End Turn / End Combat). Scoped overflow checks pass;
portrait and landscape screenshots inspected. The new touch-target regression
fails against the old layout. Full gate passes: 2,838 units / 257 files,
TypeScript 199/199, hooks/RAW/coordinates/anchors, production build, 255.2 KB entry.
No migration. Merged PR #208 after both CI gates passed. Main deployment is
rate-limited by Vercel; v2.861.0 remains independently confirmed live.

### v2.863 — Recover casting actions on their original turn

Declared casting receipts now capture their immutable server turn and action,
bonus-action or reaction kind, including cantrips. Replays return the captured
turn alongside the server's current turn. Slot expenditure uses the same captured
turn snapshot. An authorized private reader supplies the context; the public
entry remains invoker. Altered public caster identity cannot expose another
character's action receipt. Legacy receipts remain unknown, not backfilled.

The sheet restores a confirmed action only when both server and loaded encounter
agree it belongs to the current turn. Recovery waits for combat context and runs
once per cast/turn; it never clears unrelated manual flags. Reactions now mark the
reaction counter rather than the main action. Casting-time classification reads
the leading type, so trigger text mentioning a Bonus Action does not relabel a
Reaction. Longer castings mark their initial Magic action; ongoing casting and
completion/payment timing still need manual handling.

Ten desktop/phone casting flows pass, including an actual paid cast, lost reply,
reload on a later turn, resumed effect resolution and a still-available current
action. Existing refunds, cancellation and slot-limit recovery remain covered.
All 80 SQL cases pass. Full gate passes: 2,838 units / 257 files, TypeScript
199/199, hooks/RAW/coordinates/anchors, production build and 255.1 KB entry.
Both SQL schemas lint clean; new and changed pure/controller modules lint clean.
Merged PR #207 after both CI gates passed. Production migration run
`37839538112` applied the file; captured columns, trigger and privileges verified
independently. Advisors unchanged (6 security / 4 performance). Frontend remains
v2.861.0 while Vercel deployments are rate-limited.
Migration: `20261008201103_declared_spell_action_context.sql` (local/production applied).

Remaining: fully persisted action budgets across completed-cast reloads, manual
casting, automatic turn transitions and other action writers. This corrects saved
casting recovery; it is not yet a unified action-economy transaction.

### v2.862 — Current-turn spell-slot accounting

New declared spell payments and Counterspell acceptances share a private,
server-enforced slot-use ledger keyed by character and the actual current turn.
Different slot levels and action types cannot evade the limit; cantrips do not
consume it. Concurrent requests serialize with the existing character payment
lock. A rejection rolls back slot, reaction, attack, history and receipt together.

Counterspell's failed save releases the interrupted spell's historical slot use;
replaying that refund cannot clear another casting's cost. This follows SRD 5.2.1
pp.105,120: one slot expended per current turn, and no slot expenditure for the
successfully interrupted spell. Its action remains spent.

The record survives reload, rest/counter edits, and deletion of a public casting
row. Advancing or rewinding initiative creates a new server turn nonce. No new
client-accessible table or privileged public RPC is introduced.

Verification: 73 SQL cases, eight desktop/phone casting/reload/refund/cancel
flows, and scoped overflow checks pass. Screenshots inspected. Full gate passes:
2,813 units / 255 files, TypeScript 199/199, clean hooks, RAW/coordinates/anchors,
production build and 255.1 KB entry bundle. Both SQL schemas lint clean.
Merged PR #206; both CI gates passed. Production migration run `37837179216`
applied the file; ledger, both triggers and private privileges independently
verified. Advisors unchanged (6 security / 4 performance). Frontend v2.861.0
remains live while Vercel builds are rate-limited.
Migration: `20261008195719_spell_turn_slot_ledger.sql` (local/production applied). Existing payments have no reliable captured turn and are not
retroactively assigned one. Manual/legacy slot writers and free feature casts
still need integration. Action/bonus/reaction budgets are a separate follow-up:
local declaration callbacks can still mark today's action for an old recovered
casting. This release enforces slot costs at the verified payment boundaries.

### v2.861 — Map controls clear combat overlays

Monster actions now reserve a desktop side lane and become a scrollable phone
drawer. Fit map and Find selection account for that lane; navigation clears the
combat strip, party cards and phone drawer. Collapsing or ending the encounter
restores space. Short landscape uses labeled tooltips with compact icons; undo
and redo retain a separate readable row when needed.

Fixed native DOMRect getter handling (spreading a rectangle erased its edges)
and deferred shared bottom-inset writes out of ResizeObserver delivery. Both
issues were reproduced by real browser checks. Character and creature conditions
share 44px native buttons, keyboard activation, focus styles and a consistent
palette. Quick panels appear above the monster rail.

Eight desktop/phone condition and layout flows pass; two strengthened layout
flows also cover real saved token movement, undo/redo, rotation, encounter end,
camera bounds, console and scoped overflow checks. Screenshots inspected.
Full gate passes: 2,813 units in 255 files, TypeScript 199/199, clean hooks,
RAW/coordinates/anchors, production build and 255.1 KB entry bundle. New modules
lint clean. Merged PR #205 after both CI gates passed. No database migration.
Frontend v2.861.0 independently confirmed live after deployment completed.

Remaining UI work: compact the combat strip further on phones/short landscape;
its current card/action layout consumes substantial map space. This release
restores reachable controls, not a claim of Roll20 parity or complete map polish.

### v2.860 — Recoverable map conditions and accessible combat panels

Map quick panels now settle condition deltas on the server. Character changes
reach its combat bodies; creature changes remain confined to the selected
instance. Each update, concentration cleanup, history and receipt commit together.
Source-aware removal preserves independent effects and overlapping incapacity.
Unconscious leaves Prone when removed and prevents standing while it remains
(SRD 5.2.1 pp.184,191). Campaign cascade settings, unlocked character overrides,
Psionic Guards immunity and exhaustion counters are respected.

Saved requests survive reload and ambiguous responses; retry/cancel use the same
identity. Replaying an old receipt never restores its old condition snapshot.
The panels now render above the fullscreen map and combat turn bar: real phone
clicks previously could not reach the lower condition controls.

Six desktop/phone browser flows pass, including both lost responses followed by
reload, actual character/combatant state, concentration, creature instance identity,
console checks and scoped overflow checks. Screenshots inspected. Original map
write failed the new sync check; pre-portal UI failed the real phone removal click.
Full gate passes: 2,804 units in 253 files, TypeScript 199/199, entry 255.1 KB.
Sixteen SQL cases pass, including auth, concurrency, replay/cancel, rollback,
concentration cleanup and Psionic Guards. Both SQL schemas lint clean. Four
additional desktop/phone rotation and keyboard checks pass (10 UI flows total).
Merged PR #204. Both CI checks passed. Production migration run `37831381913`
succeeded; independently verified ledger, column and RPC. Advisors unchanged
(6 security / 4 performance). Frontend v2.860.0 independently confirmed live after deployment completed.
Migration: `20261008185313_map_condition_lifecycle.sql` (local and production applied).
This does not reconcile historical condition drift, replace all encounter/sheet
condition writers, or introduce a complete multi-source condition ledger.
The control overlap and condition-chip follow-ups are addressed in v2.861.

### v2.859 — Detection spell details and source accuracy

Audited Detect Magic, Detect Poison and Disease, and Detect Thoughts against
SRD 5.2.1 p.123. The complete source-backed descriptions replace legacy canonical
text in both static and database-backed views. Homebrew/gated records are kept.
Detect Thoughts no longer carries the old INT-3 cutoff or opposed-INT escape:
it includes telepathic eligibility, two distinct modes, next-turn probing,
Wisdom save, target awareness, and an Arcana check against the spell save DC.
All three spells retain their precise material, duration, range and barrier details.

Nine focused data tests pass. Six desktop/mobile browser cases cover source links,
critical clauses, stale canonical records and homebrew preservation. New detection
views pass scoped overflow checks; screenshots inspected. Restoring the old detail
layer makes the new browser test fail on the missing barrier rule. Full gate passes:
2,783 units in 251 files, TypeScript 199/199, entry 255.1 KB. Merged PR #203
(`923f78f`), both CI gates passed. Frontend publication remains rate-limited;
last public version verified v2.856.0.
No database migration; no automated information reveal or barrier ray tracing.

### v2.858 — Legal higher slots and accurate casting cost

Higher-slot eligibility now follows SRD 5.2.1 pp.104-105: a spell does not need an
extra scaling benefit to use a higher slot. Shared pure rules govern the sheet,
spell list and picker. Empty lower tiers no longer force the picker to default
to an unavailable slot; explicit exhausted-tier rows cannot charge another tier.
The picker explains that additional effects require the spell's own rules.
Sparse damage/healing tables no longer hide otherwise available slot choices.

Manual damage confirmation previously called both utility casting and damage
casting, repeating the action and concentration callbacks. It now invokes one
casting path. This does not add durable recovery to manual/area/healing paths.

Focused rules/component/parser tests pass (59); desktop and mobile browser flows
verify cancellation, level-3 Detect Magic payment with empty level-1/2 slots,
and concentration. Screenshots inspected and scoped overflow checks pass.
Restoring the old scaling-clause restriction makes the browser test fail at the
missing upcast control. Final browser flows also pass console/network checks.
Full gate passes: 2,778 units in 251 files, TypeScript 199/199, entry 255.1 KB.
Merged PR #202 (`2083dcc`), both CI gates passed. Public frontend last verified
at v2.856.0; v2.858 publication pending. No database migration.

### v2.857 — Destructive Thoughts character targets

The damage queue now maps character targets to the combat log's `player` label,
while preserving `character` on the attack itself. The old label violated the
log's database constraint and rolled back the queued damage and receipt.
Creature-target behavior is unchanged. Expanded the full delivery test group to
exercise both target kinds, including concurrent retry, deletion, identity/hidden
target guards and receipt rollback.

Before the fix, the creature delivery passed and character delivery failed with
`combat_events_target_type_check`. Migration
`20261008182000_psionic_character_target_delivery.sql` is applied locally;
49 database cases pass, including both target types and Biofeedback regressions.
Full gate passes (2,759 units, TypeScript 199/199, entry 255.1 KB); public-function
SQL lint is clean. Merged PR #201 (`7dab613`); both CI gates passed. Production
migration run `37824659205` applied the file; actual apply log and independent
ledger confirm it. Database advisors unchanged (6 security / 4 performance).
Frontend publication remains rate-limited, last verified v2.854.0. No UI change.

### v2.856 — Saved combat spells and usable phone casting controls

Single-target spell attack/save buttons now use the existing saved declaration,
payment and Counterspell settlement flow. A private payment record keeps the
original target identity, casting source, damage expression and slot. Delivery
queues one attack only after successful settlement; retries return its receipt,
even if the DM later deletes the attack. Changed/hidden targets and ended encounters
reject new delivery. Canceled or countered spells cannot deliver damage.

Mind Spike's missing combat button traced to damage stored only in its slot table.
The base lookup now reads that table, and explicit upcast entries also govern
combat/manual dice and previews. Phone testing also reproduced the floating dice
tools blocking the sheet's final Cast button; CharacterPage now has measured
bottom scroll clearance. Target-picker failures are visible inside the dialog.

Four desktop/mobile browser flows pass for Psion Mind Spike and Wizard Witch Bolt:
last-slot payment, reload, a lost delivery response, one queued attack and no
second payment. Overflow probes pass; Mind Spike screenshots inspected. All 47 SQL
regression cases pass. Full gate passes: 2,759 units, TypeScript 199/199,
entry 255.1 KB. Private-function SQL lint is clean.
Merged PR #200 (`54d3ab3`), both CI gates green. Migration
`20261008175130_declared_spell_combat_delivery.sql` applied in production by run
`37823592625`; actual apply log and independent ledger query confirm it.
Publishing has resumed: public frontend currently verified at v2.854.0; v2.856
frontend publication is still pending.

Remaining: durable area/multi-beam/healing and manual/upcast-modal paths, free
leveled-cast receipts, a current-turn slot ledger and broader Sharpened Mind use.
Queued attacks recover after reload; partially started concentration/buff/summon
choices still require the existing explicit review. A changed target/ended
encounter requires DM review; no automatic refund or retargeting is inferred.
Spell values are captured from the selected client data, not independently
recomputed by the database. Source/catalog accuracy remains a separate audit.

The Destructive Thoughts character-target issue is addressed in v2.857 above.
Witch Bolt's
static follow-up-damage/range text also needs the existing 2024 data audit.

### v2.855 — Confirm attack declarations before charging

Single-target attack declarations no longer call the cost callback when creation
returns no attack. Confirmed declarations record their cost before rolling, so a
roll failure does not silently skip payment. An ambiguous response offers a retry
with the original request ID, target and callback; repeated clicks are serialized.
Roll failures direct players to the DM's existing attack instead of declaring again.

Eight component tests cover absent receipts, lost responses, save/auto-hit attacks,
roll failures and callback failures. Desktop/mobile local database flows confirm
one row after a real committed insert whose response is lost. Recovery is currently
component-lifetime only. Spell payment remains a separate client update here;
durable payment/delivery and the current-turn slot ledger remain next priorities.
Full release gate passes: 2,751 unit tests, TypeScript 199/199 (ratcheted from 200),
entry 255.1 KB. Both recovery screenshots inspected; phone retry text stays in bounds.
Merged PR #199 (`4dd4aa0`), both CI gates green. Vercel rate-limited;
v2.853.0 remains the last verified live frontend. No migration.

### v2.854 — Readable character-to-map navigation

Phone navigation now separates breadcrumbs, campaign/map actions and sync status.
The Battle Map label and Characters link stay readable; long campaign names
truncate within their own chip. Desktop navigation remains one row when space
allows. The join-code input is labeled and still supports Escape. Floating tool
positions no longer animate through the initiative strip during layout changes.

Validation: reproduced 39px of clipped map-button content before the fix; four
phone/desktop long-name and solo join-form flows pass, plus two final polish
reruns. Screenshots inspected. Full release gate passes (2,743 units,
TypeScript 200/200, entry 255.1 KB). Merged PR #198 (`db4e54a`), both CI gates green.
No migration. Vercel rate-limited; last verified live frontend remains v2.853.0.

Next mechanics work: connect spell-slot payment and spell-source identity to
combat declarations. Current single-target attack declarations call the cost
callback even when creation returns no attack, and action/bonus-action flags are
not a one-spell-slot-per-current-turn ledger. The SRD 5.2.1 p.105 rule concerns
slots used to cast, not all leveled spells. Preserve free Psion casts and reaction
turn distinctions; this foundation also supports qualifying Discipline triggers
and broader Sharpened Mind integration. These gaps remain unimplemented here.

### v2.853 — Floating combat tools clear phone controls

The dice and roll-history buttons now clear the measured initiative strip rather
than assuming an 88px height. Wrapped controls, viewport changes and phone
navigation/safe areas contribute to their placement. Open panels sit above their
buttons, fit the phone width, and stay within the available screen height.
The measurement is released when combat disappears. No map-root growth or schema
change is included.

Validation: reproduced a 23.6px phone overlap with the new browser assertion;
fixed desktop/mobile combat and tabletop checks pass, including a 650x450
landscape resize and return. Two final panel-capture reruns pass; screenshots
inspected for both tools and viewports. Full gate passes (2,743 units,
TypeScript 200/200, entry 255.1 KB). Merged PR #197 (`ca37c7d`), both CI gates
green. Vercel success and public service-worker version confirm v2.853.0 live.

The narrow character campaign/map header is addressed in v2.854 above.

### v2.852 — Recoverable Psion rolls and exactly-once delivery

Merged PR #196 (`c3d3f53`). Both CI gates passed. Production migration run
`37813988507` applied the file; the production ledger independently confirms it.
Frontend v2.852.0 is live (Vercel success and public service-worker version checked).
Advisor additions are the intentional
private-ledger no-policy entries, guarded authenticated definer endpoints, and a
new unused-index informational notice; no new unindexed foreign keys.

Destructive Thoughts and Biofeedback now save their base payment and recovery
context together. Enkindled and Surge payments belong to that original roll;
finalization uses recorded dice and adds the original Intelligence modifier once.
Reloading during an enhancement prompt resumes unpaid choices without repeating
paid ones. New enhancements stop after the original turn; existing receipts remain
readable. Old generic payments are not adopted retroactively.

Biofeedback applies its finalized temporary HP once, retaining a higher pool and
updating the sheet, current campaign map pieces and history in one transaction.
Replaying a receipt never restores consumed HP. A later long rest expires an
unapplied benefit and prevents further enhancement costs; short rests retain it.
Disagreeing sheet/map pools require reconciliation rather than silently restoring
a stale ward. Existing applied results remain readable after rests.

Destructive Thoughts delivers server-recorded dice to its saved target atomically
with roster validation and a delivery receipt. Changed participants, repointed map
pieces, hidden player targets and ended encounters are rejected. Concurrent or
lost-response retries create one attack; deleting an attack does not recreate it.
The DM still resolves damage normally. All unresolved records remain discoverable;
only delivered history is limited. Payment recovery directs users to the saved
roll rather than suggesting a second manual application.

Validation: full gate passes (2,741 units, TypeScript 200/200, entry 255.1 KB),
39 local database cases, six Destructive Thoughts and four Biofeedback desktop/
mobile flows. Scoped overflow probes pass; recovery screenshots inspected at both
sizes. Removing the recovery control makes its reload check fail; bypassing the
Biofeedback receipt makes its duplicate-benefit check fail. Correct code restored
and corresponding checks passed. New SQL functions have no lint findings.
Migration: `20261008160020_psionic_effect_roll_records.sql` (local and production applied).

Qualifying spell, school and line-of-sight declarations still rely on the player;
this is not a spell-cast trigger ledger. Legacy generic payments keep their old
manual-effect recovery. Tabletop damage remains manual. Full Sharpened Mind
weapon/spell/AoE integration and broader map polish remain next priorities.

### v2.851 — Finalized Psychic damage survives refresh

Merged PR #195 (`c134c55`), both CI gates green. Vercel publishing remains rate-limited.

Destructive Thoughts saves its finalized dice, amount, original target and stable
queue request ID in browser storage before delivery. Reopening the same character
restores the result, including a retry after a committed response is lost. Only
minimal actor/target identities are saved; the rest of the roster is excluded.
Unresolved damage cannot be overwritten by a new roll. Clearing an unresolved
result asks the user to check combat and record manual damage first. Saved data
is recovery context, never proof of payment or authorization to change HP.

Validation: full gate passes (2,693 units, TypeScript 200/200, entry 255.1 KB). Six desktop/mobile browser flows pass, plus two restored-code reload/layout checks. Disabling persistence makes the new post-reload assertion fail; correct code is restored. Screenshots inspected at both viewports.

This covers finalized results in the same browser. Closing during base payment
or enhancement prompts still uses the existing payment-confirmation/manual-effect
recovery. Cross-device recovery, server payment/trigger association, atomic roster
validation/declaration, and concurrent-tab initiation remain follow-up work.
Storage failure leaves the current displayed result and attempts history logging,
but cannot promise refresh recovery. No migration is included.

### v2.850 — Paid damage delivery identity checks

Merged PR #194 (`83bfd2a`). Frontend publishing reported Vercel's 24-hour rate
limit; no database migration was required.

Before submitting a paid Destructive Thoughts roll, the client now rechecks the
original actor and target participant, entity, type and combatant identity. A
rename is allowed; replacing/repointing a roster entry requires manual review.
Receipt recovery checks campaign, encounter and attack source/types as well as
original dice. It still recovers an existing result after its encounter ends.

Validation: 20 focused cases, 2,683 unit tests, all release gates, and three real paid-damage browser flows pass. An initial unrelated dialog timeout passed in isolation and on the complete gate rerun.

This is client preflight and receipt validation, not an atomic payment/delivery
transaction. Roster changes between the final read and declaration remain a
server-side follow-up, along with reload recovery and qualifying-spell linkage.

### v2.849 — Sharpened Mind in Destructive Thoughts resolution

Merged PR #193 (`409751d`). Production migration run `37802483124` applied
`20261008145514` at 2026-10-08 15:39 UTC. Frontend deployment is still pending.
Advisor changes are expected: private RLS ledger without client policies, two
DM-authorized security-definer endpoints, and newly unused FK indexes.

The DM damage dialog now previews Psychic defenses, immediate Sharpened resistance
bypass, and an optional replacement of one saved damage die. It uses an active
finalized activation's recorded number (including paid Enkindled/Surge changes),
preserves original dice, and claims one replacement per current combat turn.
Another creature's turn permits a new use; overlapping activations share that limit.
The DM selects one active record rather than combining recorded numbers. Unfinished
activations still provide immediate resistance bypass; finalizing is needed only
for selecting their recorded number. The source is the user's private UA2025
Psion Update, pp.4–5; this does not add it to the public class library.

Migration `20261008145514_sharpened_damage_resolution.sql` commits turn use, HP,
death state, concentration, history and the attack receipt together. Failed writes
roll everything back; duplicate requests reuse the attack receipt. Deleting an
applied attack cannot refund the turn use. Scoped actor/target locks and the
encounter turn token protect concurrent requests. Current sheet/encounter wards
are included, and unknown/conditional defenses require an explicit DM choice.
Manual damage edits remain available and get a private adjustment event.

Validation: full gate green (2,672 units, TypeScript 200/200, entry 255.1 KB),
18 new database cases plus 34 existing context/application/life-state regressions pass.
Two additional paid player-to-DM flows pass. Six desktop/phone browser cases pass, including a paid Sharpened activation and
lost committed response. Scoped layout checks pass; screenshots show replacement
1→8 and final damage 20. Deliberately skipping replacement arithmetic makes that
browser case fail; corrected SQL is restored. New/replaced SQL functions have no
lint findings. Maximum recorded 36, lower-value replacements, off-turn use,
expiry, incapacitation, immunity, stale wards, overlapping activations, deletion,
rollback and competing attacks are covered.

Scope remaining: weapon attacks, other Psion spells/features, shared AoE rolls and
standalone/tabletop damage still need integration. The existing three-argument
application RPC remains compatible for older frontends; the new dialog uses the
new transaction. Destructive Thoughts still needs durable payment/trigger linkage.
Review low-Intelligence minimum/cap wording separately; preserved dice are not proof
of a valid triggering Psion spell. This is not a claim that all Psion automation is finished.

### v2.848 — Species-aware damage resistance

Tiefling resistance follows the saved Fiendish Legacy: Abyssal Poison, Chthonic
Necrotic, Infernal Fire. Missing/unknown choices grant no guessed automatic trait.
2024 Goliath no longer receives blanket Cold resistance. Manual resistances remain
intact, and custom names no longer inherit traits through arbitrary substring
matches. Source: [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf),
Goliath and Tiefling (pp.85–86).

Sheet defenses and party damage use the corrected pure resolver. Migration
`20261008143826_party_damage_species_choices.sql` includes choices in the saved
party-damage context, so a changed legacy invalidates an uncommitted preview.
New saved requests identify the corrected rules; pre-upgrade requests retain
frozen calculation validation for exact receipt replay/cancellation. They are
not silently recalculated or dropped. Existing server snapshot checks still reject
uncommitted requests with an old context.

Full gate: 2,663 units, TypeScript 200/200, entry 255.1 KB.
Local checks: 21 database transactions, six desktop/phone browser cases including
lost-response recovery, and a final two-platform legacy rerun pass. Screenshots
show 23 Poison becoming 11 damage and HP 50→39. Replacing the Abyssal resistance
with Fire makes the actual browser regression fail. No SQL lint findings for the
updated context function. Other species-choice automation and typed attack damage,
including Sharpened Mind, remain follow-ups; this does not claim they are integrated.

Merged as PR #192 (`0321138`). Production migration run `37795634724` applied
species-choice context at 14:49 UTC on October 8. Production frontend remains
blocked by Vercel's 24-hour deployment rate limit.

### v2.847 — Correct condition removal and concentration cleanup

Waking leaves Prone (SRD 5.2.1 p.191). Removing one incapacitating condition
preserves derived Incapacitated while another remains and transfers its parent
tracking. Independent sources remain intact. End-of-turn upkeep skips inherited
save/expiry metadata, so an old child timer cannot stand a waking creature up.
Failed client condition reads/writes now stop removal instead of reporting success.

Migration `20261008142532_condition_removal_lifecycle.sql` applies the same rules
inside the shared concentration transaction used by damage and failed saves.
The helper remains inaccessible to application roles; existing authorization,
locking and rollback stay in the transaction endpoints. Local database checks
compare all nonempty removal subsets across the four incapacitating parents.
Actual concentration settlement also covers waking and simultaneous parent removal.

Validation: full gate green (2,651 units, TypeScript 200/200, entry 255.1 KB);
43 database cases pass; no lint findings in either new/replaced SQL function.
Restoring the old cleanup makes the waking/overlap regression fail; fixed SQL
restored afterward. This does not solve multiple independent applications of the
same condition (the current source map has one entry), concurrent client condition
writes, automatic healing wake-up, or the map quick-panel's separate writes.

Merged as PR #191 (`3dab0e3`). Production migration run `37793791024`
applied the condition-removal migration at 14:36 UTC on October 8. Preview deployed;
production frontend was rejected by Vercel's 24-hour deployment rate limit.

### v2.846 — Consistent 2024 condition movement

The 2024 Stunned condition does not prevent movement; the condition data and map
had retained the old restriction. Remove that restriction while retaining action,
reaction, concentration and Strength/Dexterity-save effects. Conversely, movement
validation now respects Paralyzed/Petrified/Unconscious as well as Grappled and
Restrained. Dead actors and six levels of exhaustion have no voluntary movement.

Map allowance, initiative counter, move validation and movement-log totals now
share the same pure calculation: exhaustion/Slow reductions, existing halving
setting, then Dash. This fixes previews omitting reductions and the initiative
counter showing unadjusted base speed. The map root shrinks rather than growing.

Source: [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf),
Stunned (p.189), plus existing exhaustion/Dash rules. Local regression covers a
real Stunned player's movement, exact remaining-budget rejection, reduced/Dash
movement and log values, Paralyzed blocking and desktop/phone views. Reintroducing
the old Stunned restriction makes the real-player test fail. Full gate passes:
2,636 units, TypeScript 200/200, entry 255.1 KB; both desktop/phone runs pass.

Merged as PR #190 (`288d4ff`). Vercel rejected deployment with a 24-hour rate limit.
Condition-removal follow-ups are addressed in v2.847. Map quick-condition writes
still need synchronization/cascade handling. Dash/Disengage eligibility needs
server-authorized action settlement, including incapacitation and spent actions.

### v2.845 — Reachable, viewport-aware map token panels

The creature quick-panel handler already recognized modern creature IDs, but
its context-menu entry checked only legacy NPC IDs. The menu now exposes the
existing panel for supported creature-linked tokens. Placement mapping preserves
the source type so SRD summons and custom definitions do not open a homebrew-only
panel; unlinked markers stay unchanged.
Character and creature panels share measured positioning that responds to screen
rotation, content size and visual viewport changes when the keyboard opens.
Height caps remain 600/420 pixels; smaller viewports scroll inside the panel.

Local checks cover both real token types on desktop and phone, landscape/narrow
screens and a keyboard-only viewport change. Full gate passes (2,608 units, TypeScript 200/200, entry 255.1 KB); all four
desktop/phone browser cases pass with clean scoped overflow checks. Removing the
visual viewport resize listener makes the keyboard-bounds assertion fail.
Merged as PR #189 (`8691300`). Vercel rejected deployment with a 24-hour rate limit.
Condition-button cascade handling
remains a separate correctness follow-up; this change only restores panel access
and keeps its controls within the visible screen.

### v2.844 — Atomic Destructive Thoughts damage application

Seeded Destructive Thoughts now applies through one DM-authorized transaction:
verified attack/target context, temporary HP, HP, death saves/conditions, sheet HP
and suppression marker, concentration cleanup/offer, combat events and applied
state commit together. A saved receipt keyed by attack ID makes retries and
simultaneous requests return one result. The client probes that receipt before
reading mutable target state, and resumes automatic concentration through its
existing saved-roll API. Legacy attacks without saved dice retain their old path.

Migrations `20261008125440_pending_damage_context.sql`,
`20261008130309_pending_damage_pool_settlement.sql`,
`20261008131207_pending_damage_life_settlement.sql`, and
`20261008132417_atomic_destructive_thoughts_application.sql` compose this flow.
Partial pool/life stages remain inaccessible to application roles. Unresolved
reactions, changed snapshots and mismatched sheet/combat HP maxima reject the
whole application. The endpoint preserves existing Petrified resistance and DM
final-damage adjustments; it does not introduce typed affinity automation.

Validation: full gate passes (2,597 units, TypeScript 200/200, entry 255.1 KB);
41 foundation database cases plus nine endpoint cases; desktop/mobile checks
cover natural and Surge-adjusted dice, actual Apply, sheet synchronization,
replay and deliberately lost committed responses. The new browser assertion
fails with the old branch restored (sheet HP 20 instead of 7). Release status:
merged in PR #188 (`c368205`); workflow `37786678336` applied all four migrations
to production. The only new advisor notices are expected informational RLS-without-policy
entries for the two private receipt tables, which deliberately deny direct app access.
Vercel subsequently confirmed the production deployment completed.

Remaining: normal attack settlement must include melee retaliation and mastery
with saved outcomes (especially Topple). Typed defenses need explicit handling
for unknown/conditional text and reaction/DM adjustment provenance. Sharpened
replacement must validate source, duration and once-per-current-turn usage,
including shared-AoE dice. Destructive Thoughts still needs payment/trigger
binding and paid-result reload recovery. Character species defaults must be
choice-aware before reuse: blanket Tiefling fire/Goliath cold is insufficient.

### v2.843 — Keep creature damage defenses through import and editing

Catalog import now copies resistance, immunity and vulnerability lists into
the campaign creature. The editor preserves conditional wording and distinguishes
unrecorded legacy fields from explicit empty lists. Existing copies are not
backfilled from their catalog source because users may have customized them.
The form stacks on narrow screens; the creature library now wraps its fixed
folder sidebar so relationship badges cannot cover tappable creature names.

Validation: eight focused cases; full gate (2,587 units, TypeScript 200/200,
hooks clean, 255.1 KB entry); desktop/phone import, edit, save and reopen tests,
with screenshots and overflow checks. Removing the import field makes the
browser regression fail on missing Psychic resistance; restoring it passes.
Local migration applied; advisors add no findings compared with the preceding
run (existing creature-table policy performance warnings remain). These saved
defenses are not yet wired into pending-attack HP settlement.
PR #187 merged as 1c14aad; production workflow 37780286624 applied
20261008124213_creature_damage_defenses.sql successfully.


### v2.842 — Preserve active Sharpened records

The existing saved-roll lookup now retains every duration/condition-tracked
activation that has not ended, even beyond five finalized rolls. Unfinished
paid rolls remain recoverable. Only inactive or untracked finalized history is
limited to five. No strongest/latest overlap choice or automatic damage claim
is implied by returning these records.

Validation: 37 local database cases pass, including authorization, expiry,
incapacitation and missing tracking. Restoring the old lookup makes the new
regression fail (five records instead of seven); restoring the fix passes.
Full gate: 2,579 units, TypeScript 200/200, hooks clean, entry 255.1 KB.
The changed function has no advisor findings; local migration applied.
PR #186 merged as 3bf7964; production workflow 37778702287 applied
20261008123448_preserve_active_sharpened_rolls.sql successfully.


### In progress — typed damage resolution and Sharpened integration

Local `src/rules/typedDamage.ts` work groups same-type components before resistance,
keeps other types separate, applies explicit adjustments before defenses, and
preserves immunity/vulnerability when Sharpened bypass applies. Sixteen focused
cases cover these rules, source-sensitive rounding and unsafe numbers. Mixed-source
half-damage allocation fails closed until adjustment provenance is available. This module is not connected to HP application and is not a shipped
feature; do not infer completed Sharpened automation from these tests.
Full local gate passes: 2,579 unit tests, TypeScript 200/200, hooks clean,
production build and 255.1 KB entry budget.

Remaining integration must preserve reaction/DM adjustment provenance, load target
defenses from the actual character/creature definition, and settle HP plus the
once-per-current-turn replacement without duplicate writes. `applyDamage` still
uses separate writes and blanket-condition resistance; its reaction/HP side effects
need the same transaction/recovery guarantees as the recorded damage roll. The v2.842 lookup keeps all tracked, unexpired Sharpened activations
plus unfinished recovery and five inactive finalized records. Resolve
activation overlap explicitly instead of guessing the strongest/latest number.

### Migration release-tool recovery

The v2.841 production workflow failed before connecting to the database: the
old setup action hit GitHub's unauthenticated latest-release API limit. Pin the
current official setup action by commit and use its lockfile version resolution
(2.111.0, matching local verification), avoiding the latest-release lookup. The
existing secret gate, dry run and pending-only production apply stay in place.
Typed-defense integration work is retained locally while this rollout is repaired.

Validation: full gate passes (2,563 units; TypeScript 200/200; 255.1 KB entry).
Hosted workflow 37776787925 passed with the pinned action; its actual Apply
pending migrations step applied 20261008120155_psionic_prerolled_damage.sql to
production. Frontend deployment remains blocked by the separate Vercel rate limit.

### v2.841 — Destructive Thoughts retains actual damage dice

The paid result now carries original Energy Dice, effective Surge-adjusted values,
die size and Intelligence into its combat declaration. Resolving it reuses those
dice instead of interpreting the fixed total as a flat modifier. Typed damage
records distinguish adjusted from natural dice, and the dialog/event show the
actual dice expression. Enkindled extra dice are retained in the same roll array.
The Intelligence modifier is added once; automatic-hit discipline damage receives
no unrelated weapon rider or second spell save.

The database validates the total and Surge mapping, makes the queued dice immutable,
and rejects recording that discards them. Legacy fixed-total rows remain unchanged.
This is roll provenance, not server proof of resource payment or the triggering
spell. Linking Destructive Thoughts enhancements/payment receipts, recovering a
paid result after full reload, and Sharpened replacement/typed defenses remain open.

Validation: full gate (2,563 units; TypeScript 200/200; hooks clean; 255.1 KB
entry). Twenty-five database transaction cases and four signed-in desktop/phone
queue cases pass. Screenshots/overflow checks confirm the expression and Surge
label; disabling saved-dice reuse makes the browser regression fail. Local
migration applied; changed functions have no advisor findings.

### v2.840 — Combat dialog recovers after failed actions

Attack/save/damage/application/cancellation controls share a same-frame duplicate
click guard and release loading after failures. Errors remain visible with a
refresh control. Every completed request reloads saved state, so a committed but
lost damage response shows its recorded damage instead of inviting another roll.

Attack/reaction reads publish together; failed reaction reads lock action buttons
instead of appearing as no pending reactions. Outstanding reaction offers also
block Apply Damage, with the waiting participant and reaction displayed. Newer
refreshes supersede older
reads, and campaign/role changes retire late callbacks. Cancellation is disabled
while another write is pending. Long dialogs scroll within the phone viewport.
This improves recovery presentation; it does not make HP application transactional
or restore reaction offers that were never created. Those remain follow-ups.

Validation: full gate (2,548 units; TypeScript 200/200; hooks clean; 255.1 KB
entry). Four signed-in desktop/phone cases cover rejected requests, lost committed
responses, retry controls and outstanding reactions. Screenshots/overflow checks
passed; temporarily restoring the old damage handler makes the regression fail.

### v2.839 — Damage rolls consume one-use bonuses atomically

Damage recording now locks the attacker and commits the typed dice, attack state,
and eligible one-use bonus removal together. Competing attacks cannot both spend
the same bonus snapshot. Retries return the winning saved roll without consuming
a newly reapplied bonus. Missing/changed attack state, invalid component totals,
and unauthorized callers fail before committing; later transaction failures roll
back all writes. Existing save rounding and critical-hit behavior are preserved.

The application uses this transaction for normal damage and misses. Receipt
validation compares component fields rather than JSON key order. This closes the
bonus-consumption gap from v2.838; post-record event/reaction delivery still needs
a recoverable workflow. It does not yet automate Sharpened damage replacement or
resistance bypass. Typed defenses and verified Psion source identity remain next.

Validation: full gate (2,538 units; TypeScript 200/200; hooks clean; 255.1 KB
entry). Twenty-five local database/browser cases cover concurrent calls, competing
attacks, rollback after consumption, permission failures, stale state, rider filters,
misses, saves, critical dice and a committed response lost before client receipt.
Local ledger is current; no advisor findings for the new function/private table.

### v2.838 — Typed damage dice survive recording

Pending attacks now retain versioned base/rider components: damage type,
expression, individual values, flat modifier and raw total. Fixed maximums from
the critical-hit house rule are distinguished from actual rolls. Shared legacy
rolls remain explicitly unknown instead of inventing die provenance. Old attack
rows stay null because lost rider data cannot be reconstructed safely.

Fixed a malformed attacker-buff select that could silently omit bonus damage.
A failed bonus read now stops recording. Successful recording checks the original
attack state; a failed/stale write cannot consume a single-use rider or emit a
successful damage event. Existing final damage, reactions and DM overrides retain
their separate fields; these components describe original raw damage, not a claim
that final damage can be recomputed without those later adjustments.

Next: apply defenses per typed component and persist actual spell/feature origin
before enabling Sharpened resistance bypass or once-per-turn replacement.
Recording and single-use rider consumption still need a shared transaction to
cover a committed write whose response is lost.

Validation: full gate (2,526 units; TypeScript 200/200; hooks clean; 255.1 KB
entry). Two signed-in browser/database cases exercise the real damage pipeline
for normal and fixed-maximum critical hits, typed riders and stored-roll reuse.
Local migration applied; no pending ledger entries or changed-table advisor
findings. Unit checks cover stale writes, missing bonus reads and legacy/shared
dice provenance.

### v2.837 — Sharpened damage rules distinguish the two benefits

Rechecked the supplied UA2025 Psion Update pp.4-5: psychic-resistance bypass is
limited to weapon attacks, Psion spells and Psion features. Attack Mode is broader:
it replaces one die when dealing psychic damage, including other-class sources.
The pure damage rules preserve immunity/vulnerability, distinguish unknown spell
provenance, replace rather than add the recorded value, allow a value above the
damage die size, and apply a shared-roll replacement before per-target reductions.
The private Psion roll panel now explains these distinctions and its manual status.

These are rule/preview primitives, not automatic damage application. Pending attacks
currently combine differently typed riders before defenses, and store no reliable
Psion spell provenance. Add typed damage components, authoritative active-effect
selection and a once-per-current-turn receipt before integrating. Overlapping UA
activations need an explicit rule decision; do not import the 2014 same-feature
stacking rule by assuming the 2024 spell-only text covers every feature.

Validation: full gate (2,509 units; TypeScript 200/200; hooks clean; 255.1 KB
entry), desktop/mobile expanded guidance and recovery checks with overflow probes.
The lost-response browser test now interrupts only Surge, avoiding a race with
the preceding Enkindled request. Replacements require actual psychic damage,
not a miss or damage entirely prevented by target defenses.

### v2.836 — Atomic combat clock boundary

A guarded DM transaction now commits the turn position, campaign round clock,
encounter buff decrement and lair-action reset together. It derives the incoming
actor from the current living roster, checks the expected turn identity and
planned position, rejects ambiguous/missing roster links, and saves an immutable
receipt. Replay cannot advance twice or revert a later turn. Manual time advances
and combat wraps share campaign serialization, preserving both increments.

This is the transaction/API foundation, not yet the advanceTurn call site.
Integration must preserve saved confirmation and phase ownership: outgoing
condition/aura ticks and incoming death-save/start ticks must not run again after
a lost response. Existing participant budget and recharge writes also precede
the old boundary. The character sheet currently calls that same DM-only write
path for player End Turn; handle that authorization gap explicitly rather than
silently treating an RLS-filtered update as success. These remain next work.

Validation: full gate (2,487 units; TypeScript 200/200; hooks clean; 255.1 KB
entry), 14 database cases covering wrap/non-wrap, races, rollback, replay,
permissions, roster errors and overflow. Local migration applied; no changed-
object security or database-lint findings.

### v2.835 — Recoverable campaign time controls

Both Party-tab time panels now use one shared component and the atomic time API.
Requests are saved before sending, with separate keys per user/campaign/request.
Unknown results survive reload; confirmation reuses the original request, and
new advances stay disabled while recovery is pending. Cancellation creates a
server-side fence against delayed requests and preserves time already applied.
The display reads the current server clock and time scale. This control advances
game time only; it never grants rest benefits or restores resources.

Storage failures block submission. Late responses cannot update a different
campaign, and saved requests are checked again before sending. The extracted
panel removes the duplicate read/modify/write paths and their separate buff
sweeps. Combat round-wrap writes still need their own transactional follow-up.

Validation: full gate (2,466 units; TypeScript baseline ratcheted to 200; hooks
clean; 255.1 KB entry), 15 database cases and four desktop/mobile recovery cases.
Screenshots and overflow probes reviewed; bottom controls pass browser hit-testing
above fixed navigation. Local migration applied; no changed-object lint/advisor
findings. The storage-failure test uses the environment's actual storage object.

### v2.834 — Atomic manual campaign time backend

A DM-only, replay-safe transaction now advances the campaign clock, decrements
all three buff stores and prunes expired immunities together. Identical requests
return the original receipt without ticking twice; independent concurrent
requests retain both increments. Stored payloads cannot be changed on replay.
The server validates the campaign time scale and rejects intervals that round
to zero or overflow the clock. Character rows are locked before private duration
clocks, and malformed buff data rolls back the whole request.

This is the server foundation. Existing Advance Time controls and combat round
wraps still use their old writes; next connect saved-request UI recovery and
replace the separate combat clock update. Do not claim those paths atomic yet.
The API adapter validates saved requests, preserves identity on transport retry
and rejects inconsistent receipts without discarding recovery.

Validation: full gate (2,457 units; TypeScript 201/201; hooks clean; 255.1 KB
entry), 12 database cases covering races, rollback, authorization, scale changes,
expiry and replay. Local migration applied; no changed-object advisor findings.

### v2.833 — Sharpened duration follows declared game time

New activations capture a private elapsed-time counter and recovery epoch.
Campaign round-clock increases contribute their configured seconds per round;
solo turns use that campaign scale or six seconds without a campaign. Combat
turn changes do not also add solo time. Backward/no-op clock edits cannot restore
duration. Changing the scale affects future ticks only. Rests and one-minute
Restoration expire the effect through the recovery epoch, without assuming an
exact rest length. Final confirmation/replay never restarts the original minute.

The panel displays remaining game-time seconds and expiration, refreshing on
combat/solo turn changes. Campaign fast-forward changes can be refreshed with
Refresh rolls. Expired activations reject new enhancement costs while preserving
paid results. Older records remain explicitly untracked. Duration still depends
on the existing campaign clock writes; their separate read/modify/write behavior
needs an atomic follow-up. Psychic resistance bypass and once-per-turn damage
replacement remain next.

Validation: full gate (2,438 units; TypeScript 201/201; hooks clean; build and
255.1 KB entry), 34 Sharpened database cases and desktop/mobile recovery checks.
Local migration ledger is current; database lint/security advisors report no
findings on changed objects. Stabilized the outcome-dismissal test by waiting
for modal focus before sending Escape.

### v2.832 — Sharpened incapacitation cannot be undone by recovery

New Sharpened activations capture an incapacitation epoch. Becoming Incapacitated,
Unconscious, Paralyzed, Petrified or Stunned permanently ends that activation;
removing the condition or confirming its saved number cannot revive it. Active
combatant conditions take precedence over stale sheet conditions. Roster and
encounter transitions observe the newly authoritative condition state as well.
New enhancements on an ended activation roll back their cost/history, while
exact paid replays and final-number recovery remain available.

The roll panel displays the latched expiration and refreshes on relevant sheet
or combat condition changes. Older records without an epoch remain untracked,
not inferred active. This does not yet implement the one-minute duration or
psychic damage effects: combat, solo-turn and campaign Advance Time clocks need
coordinated handling without counting time spent waiting at the table.

Validation: full gate (2,432 units; TypeScript 201/201; hooks clean; build and
255.1 KB entry), 28 Sharpened database cases plus 48 existing discipline/Guards
regressions, and two desktop/phone live recovery/expiration checks. Phone
screenshot reviewed; no overflow. New migration 20261008103303 applied locally;
ledger current and no changed-object advisor/function-lint findings. The preceding
record migration 20261008102503 is confirmed applied to production by workflow
37764474697, actual apply step.

### v2.831 — persistent Sharpened final-roll confirmation

New activations create a server-side pending record even without enhancements.
The sheet automatically confirms the final paid total after enhancement choices;
interrupted confirmations remain recoverable in a dedicated roll panel. Original
and final dice, total and original activation time survive reload. Confirmation
locks further enhancements without repeating costs or restarting duration. The
panel explicitly labels these as saved numbers, not currently active effects.

Preview and finalization share one database computation. All unfinished records
remain discoverable, with the five latest completed records retained in the UI.
The owner/current DM controls access. Frozen sheets and character switches block
unsent confirmation; unresolved enhancement payments must be confirmed first.

Validation: full gate (2,430 unit tests; TypeScript 201/201; hooks clean; build
and 255.1 KB entry), 16 local DB cases, two desktop/phone recovery checks and
reviewed phone screenshot with no panel overflow. No changed-object database
advisor/function-lint findings; local migration ledger current.

The preceding migration 20261008101533 is confirmed applied to production by
workflow 37763185937, actual apply step. New migration 20261008102503 is local
only until the gated merge workflow. Duration/incapacitation and damage effects
remain the next integration work.

### v2.830 — link sheet enhancements to Sharpened activation

The sheet now carries the paid Sharpened activation ID into Enkindled and Surge.
The API routes those payments through the activation-bound transaction and checks
the returned identity/kind as well as dice and costs. Browser recovery preserves
that link, rejecting malformed or changed identities. Existing unrelated and
legacy enhancements keep their original transaction paths.

A live desktop/phone regression loses a committed Surge response, reloads, then
confirms the saved request: one Energy Die and three Hit Dice spent, two linked
enhancements, no second charge. Full gate passed: 2,412 unit tests, TypeScript
201/201, hooks clean, build and 255.1 KB entry. Final-roll confirmation/status, duration,
incapacitation, and damage application remain follow-up integration.

### v2.829 — Sharpened Mind saved-roll foundation

A Sharpened activation can now own its Enkindled and Surge payments. The server
reads the paid base roll, attaches each enhancement transactionally, then freezes
the final total. Exact retries return the same result without extra costs. Old
unlinked payments cannot be attached retroactively; another activation cannot
reuse them. The original activation timestamp/turn survives delayed finalization.
Character locks serialize enhancement/finalization races. Records stay private;
only the current owner/DM can use the authenticated entry points.

Validation: 60 local database regressions (12 new Sharpened cases), full gate
(2,404 units; TypeScript 201/201; hooks clean; 255.1 KB entry). Migration
20261008101533 applied locally with no pending ledger entries. No advisor or
function-lint findings on changed objects; existing unrelated findings remain.
Production application is not yet claimed.

This is backend groundwork, not completed Sharpened automation. Next: connect
sheet/recovery requests to these entry points, track the one-minute duration and
incapacitation, then enforce psychic-resistance bypass and once-per-turn damage
die replacement with correct attack/spell provenance.

### v2.828 — keep delayed Psion rolls on the originating character

Manual Energy Die and Sharpened Mind payments can finish after closing a sheet
or switching characters. Their enhancement flow now checks the original owner
before reading character state or opening Enkindled/Surge prompts. Biofeedback,
Destructive Thoughts, and conditional disciplines use the same ownership guard.
The paid base result remains in the original character's history for recovery.
Regression cases delay payment across both switching and closing, checking no
extra payment, roll, prompt, or update reaches the next character.
Full gate passed: 2,404 unit tests, TypeScript 201/201, hooks clean, and
production build with 255.1 KB entry within budget.

### v2.827 — recoverable party damage controls

Party area damage now uses authoritative previews and the atomic damage API.
The complete target group is saved before sending damage. Interrupted requests
can be confirmed after reload without damaging successful targets twice; cancel
keeps completed damage and prevents unapplied requests. Temporary HP, half damage,
resistance/vulnerability order, condition resistance, and concentration settings
are shown before applying. Automatic concentration recovery reads an existing
result before attempting a roll. Account/campaign changes stop remaining targets.

Focused checks cover immutable requests, storage failures, partial batches,
cancellation, campaign changes, and automatic-save recovery. Desktop/phone checks
cover damage previews and lost-response recovery after reload. Full gate passed: 2,399 unit tests, TypeScript 201/201, hooks clean,
production build and 255.1 KB entry within budget. Four browser checks passed.
The preceding atomic migration 20261008093955 is confirmed applied to production
by workflow 37760628529 (actual apply step). Frontend release remains subject to
the existing Vercel hosting quota. Manual single-character HP controls and
Sharpened Mind enhancements remain separate follow-up work.

### v2.826 — atomic party-damage backend and sheet coordination

New DM-only snapshot/apply/cancel RPCs use one immutable request identity per
character. Damage consumes temporary HP first, uses the active combatant's HP
when present, and updates combat/sheet pools together. A changed preview rejects
before writing. Retries return the original result without replaying HP changes;
cancellation and damage share the same character lock. Private receipts are not
readable by players. The caller supplies the already-adjusted damage total and
effective CON modifier; its character/combat snapshot must still match exactly.

The same transaction creates one casting-bound concentration offer, respects
campaign/character automation settings, or ends concentration on incapacitation.
Zero-HP damage/death failures and massive damage are recorded. Owned spell-effect
cleanup and database HP arithmetic are shared with existing save/manual-HP flows.
A damage marker suppresses only the sheet's duplicate HP-delta prompt; a later
ordinary HP change clears it and still prompts normally.

Validation: full gate (2,375 tests; TypeScript 201/201; 255.1 KB entry), 86 database
regressions across party/manual/solo damage and concentration plus two final
combat cases. Four live desktop/phone checks cover exactly one prompt during and
between encounters, then a fresh prompt for later damage. Local migration
20261008093955 applied; no pending ledger entries or diagnostics for changed
functions (four existing unrelated diagnostic entries). No production application
claimed yet. The preceding concentration migration 20261008093019 is confirmed
applied by production workflow 37758594768, actual apply step.

Next, before users can use this backend: replace PartyDashboard's legacy AoE
write with a dedicated panel, fetch authoritative previews, persist the entire
batch before sending, retain partial results/recovery per target, and settle
Auto saves through the existing stored-dice API. The old AoE controls remain
unconverted; do not describe their temporary-HP/concentration bugs as fixed yet.

### v2.825 — campaign concentration outside encounters (foundation)

The existing campaign concentration queue now accepts a save with no encounter
or combat participant. Encounter-bound saves still require a matching participant.
Settlement retains owner/DM authorization, casting-revision protection, War Caster
snapshots, saved dice, concurrent replay protection and atomic history. Offers
without a participant match the caster's campaign participant identities for
cleanup, removing owned spell effects and preserving other casters' effects. No new dice
or save implementation. Client/database types match the nullable link.

Validation: 25 real local database cases, including authenticated offer creation,
outside-encounter success/failure, permission rejection, races and stale casting;
four desktop/phone prompt checks also pass and screenshots inspected. Changed
function has no database-lint diagnostics; four unrelated existing entries remain.
Local migration 20261008093019 applied, no pending ledger rows. Full release gate
passes (2,375 tests; TypeScript 201/201; 255.1 KB entry).

This is the prerequisite for atomic party damage, not the replacement itself.
Next: one persisted damage identity updates temporary HP/current HP and queues its
concentration save together, coordinates the sheet's realtime observer, and gives
DMs safe recovery after lost responses. Party AoE's legacy direct write remains.

### v2.824 — party damage affinities and phone layout

Party AoE now loads stored resistance, vulnerability and immunity columns; the
old projection silently omitted all three. Shared damage math applies resistance
(round down) before vulnerability, so 23 damage becomes 22 when both apply.
Immunity still prevents damage; save-half remains first. Type names normalize
case/whitespace. Preview and result labels describe the actual order. Party cards
now fit narrow screens instead of forcing a 420px minimum and sideways scroll.

Validation: full gate passes (2,373 tests; TypeScript 201/201; 255.1 KB entry).
Real desktop/phone tests verify preview, applied HP and scoped overflow with
isolated local accounts. Both screenshots inspected. No migration. The pure
helper supports resistance bypass as groundwork only; Sharpened Mind is not yet
connected to it. Rules source: SRD 5.2.1 p.17.

Follow-up found during this audit: party AoE still ignores temporary HP and clears
concentration without a saving throw. Replace that legacy write with a replay-safe
atomic damage/concentration operation; do not reuse the solo-damage RPC, which
explicitly rejects campaign characters. Also audit species resistance defaults
(especially unconditional Goliath cold resistance) against the chosen lineage.
Sharpened Mind activation must link Surge/Enkindled receipts before recording its
number; the current discipline ledger stores the initial roll, before enhancements.

### v2.823 — class save protection and narrow client lookup

All existing Guards save consumers now use the boolean-only protection RPC,
validated strictly as true/false. The class-ability dialog also checks protection
for character targets, keeps the higher die, and displays/logs both dice. Pending
checks block conflicting controls and confirmation. Read errors allow retry;
closing/reopening, unmounting or replacing the save cannot apply a stale result.
Changing the save clears old resolved outcomes. Manual outcome edits preserve
the actual rolled faces. Guards activation/recovery wording now reflects the
automatic protection and warns that a recovered original effect may have expired.

Validation: full gate passes (2,362 tests; TypeScript 201/201; 255.1 KB entry).
Eight desktop/phone checks cover sheet, DM prompts, campaign/upkeep and class
saves. Final class-dialog checks also pass on both sizes with scoped overflow
and inspected screenshots. The class test mounts the real dialog with an INT-save
fixture because current built-in class metadata has no INT-save feature; real
auth, participant reads and RPCs verify another campaign member can read Guards
while private-ledger access remains denied. Migration 20261008090528 is confirmed
applied in production (Apply Migrations 37754907919, actual apply step).

Next: Sharpened Mind duration/incapacitation and psychic-damage automation. Aura
Guards integration remains a generic future-path audit (current aura is WIS).


### v2.822 — narrow campaign Guards lookup (backend foundation)

A separate authenticated RPC returns only whether a character currently has
Guards protection. The character owner, current campaign DM and current campaign
members can read this boolean. It exposes no discipline history, rolls, resource
receipts or turn token, and performs no writes or character locks. The existing
private-ledger RPC retains its owner/DM boundary. Removed membership or a
character leaving the campaign revokes access immediately on the next request.

Validation: five real database cases pass for owner, DM, member, removed member,
former campaign, anonymous/unrelated and missing-target access; activation and
expiry return the correct boolean without altering turn state or energy. Local
migration 20261008090528 applied; ledger has no pending files. Database lint
reports no issue in the new functions (existing warnings elsewhere). Full gate
passes: 2,348 tests, TypeScript 201/201, 255.1 KB entry.

Ship this migration before switching the client lookup and adding Guards to the
class-ability save dialog: players there may roll against another party member.
Production apply confirmed by Apply Migrations 37754907919 (actual apply step).


### v2.821 — Guards on end-of-turn condition saves

Automatic end-of-turn Intelligence saves now read the outgoing character's
Guards protection, keep the higher d20, and record both dice and Advantage in
the combat event. A shared pure saving-throw roller preserves normal totals and
explicit natural-extremes house rules. Unreadable protection stops the upkeep
save before rolling or removing its condition. Creature saves and duration-only
expiry do not query a character's private discipline record.

Validation: full gate passes (2,348 tests; TypeScript 201/201; 255.1 KB entry).
A real encounter advances through upkeep: two Guards dice and correct total,
successful condition removal, then protection expiry at the next own turn.
The focused tests cover expired protection, read failure, creature behavior,
house rules, hidden events and duration-only conditions. No migration.
Remaining Guards audit: class-ability save dialog and aura resolver; the only
currently configured aura save found is WIS. Hosting remains rate-limited.


### v2.820 — Guards on campaign attack saves

The campaign save resolver reads live Guards protection for character targets
before rolling, keeps the higher Intelligence d20, and records both dice and the
benefit in the combat event. It reuses canonical dice selection, including
Advantage/Disadvantage cancellation. Auto-fails and recorded-save retries do not
roll or reread protection. Missing/unreadable targets or failed protection reads
stop before rolling or saving. The DM save button reports failure and re-enables
for retry instead of remaining stuck. Existing save house rules are preserved.

Validation: full gate passes (2,335 tests; TypeScript 201/201; 255.1 KB entry).
Real local campaign tests confirm Guards totals, expiry, denied-read no-write,
and retry through the DM control. No migration. Other automatic save paths
(including end-of-turn saves and auras) still need an audit; Sharpened Mind is
still manual. The existing monster-action dice animation is cosmetic and does
not yet display the stored Advantage pair. Hosting is still rate-limited.


### v2.819 — Guards on DM-requested saves

DM save prompts now read current Guards protection before rolling. They use the
computed saving throw modifier, accept full ability names or three-letter codes,
and log both Advantage dice, the kept result, modifier, and pass/fail. A failed
read leaves the request available to retry; duplicate clicks, replaced prompts,
and character switches cannot roll a stale request. The banner is extracted from
the sheet root. Unknown ability names or invalid DCs cannot create a save.

Validation: 36 focused tests and desktop/phone live DM-prompt browser checks pass,
including Advantage expiry and actual history totals. Full gate passes: 2,326
unit tests, TypeScript 201 (baseline ratcheted), 255.1 KB entry. Desktop/phone
screenshots inspected and scoped overflow checks pass.
Campaign pending-attack saves and other automated save paths remain to audit.


### v2.818 — Guards status and sheet Intelligence saves

The sheet shows a verified active Guards effect even on another creature's turn
with no current discipline use. It clears the badge on expiry or a failed refresh,
and refreshes when another device changes the Psion resource revision. Malformed
effect identities are rejected; older servers may omit the new effect metadata.

The main saving-throw tiles read protection at roll time. Intelligence saves use
two physical d20s and keep the higher while Guards is active, then return to one
die after expiry. Both dice and the effective modifier are logged. Browser verification exposed
that the physical renderer ignored Advantage flags and summed all dice. The
canonical dice module now prepares two d20s, selects the appropriate face,
cancels Advantage/Disadvantage, and preserves bonus dice. The result display
strikes the discarded die and shows the combined modifier. Failed reads
prevent an unverified roll; duplicate clicks and responses arriving after a
character switch/unmount cannot start extra rolls.

Remaining integration: the separate DM save-request banner and campaign pending-
attack save resolver still need this benefit. Activation/recovery wording must
be revised when all save paths are integrated. Sharpened Mind remains manual.
This is not yet a claim of complete Guards save automation.

The renderer also removes its imperative labels during effect cleanup; a
StrictMode replay no longer leaves a stale Rolling indicator behind the result.

Validation: full gate passes (2,315 unit tests; TypeScript ratcheted to 202;
255.1 KB entry). Real desktop/phone rolls verify two dice, keep-highest plus +7,
normal saves after expiry, and no stale Rolling indicator. Screenshots inspected;
scoped discipline overflow checks pass. Guards database migration 20261008081935
is applied in production. Frontend production releases remain subject to the
Vercel deployment quota.


### v2.817 candidate — durable Psionic Guards protection groundwork

New Guards activations record a lasting effect in the existing discipline ledger.
Payment, use, condition removal and effect grant commit together. Charmed and
Frightened are removed from the sheet and its combatants; database write guards
prevent reapplication while protection is active, preserving other conditions.

A private token observes the existing initiative and solo-turn transitions.
Protection survives other actors and round boundaries, expires on the owner's
next turn (including rewind), and cannot be revived by replaying an old paid
request. Roster setup ignores ambiguous temporary order; a death that advances
the current actor also starts the incoming character's turn. Ending combat keeps
protection until the next solo turn. Completed rests/Restoration expire it once.
The observer never locks a character row while holding an encounter write lock,
avoiding the inverse lock order of discipline payments.

The discipline read API now returns the active Guards identity. Existing clients
ignore that extra field. REQUIRED NEXT: show the active protection and wire
Intelligence-save Advantage into sheet/campaign save rollers; revise the manual
activation/recovery messages only when those client paths are verified. This is
not a claim of complete Guards automation or Sharpened Mind automation. Historical
manual activations are not retroactively granted a new effect.

Validation: 43 real-database cases pass, including lifecycle, immunity, rollback,
permissions, concurrent advancement, migration initialization/rerun and recovery
replays. Six desktop/phone combat/Guards/secondary-Psion browser checks pass.
Full gate: 2,290 units, TS 203/203, hooks/RAW/coordinates/anchors/build/SW, 254.3 KB
entry. Security advisors retain only existing keep_warm/client_errors findings. The preceding
own-turn migration (PR159, b565e87) is applied in production: Apply Migrations
37749518251 logged 20261008081047 and completed db push. Website builds remain
subject to the hosting quota.


### v2.816 candidate — require the owner's turn for start-of-turn disciplines

Guards and Sharpened Mind now reject a fresh combat activation on another
creature's turn before charging an Energy Die or claiming the discipline. A
confirmed request still replays after combat advances without charging again.
Ordinary triggered disciplines remain usable during another creature's turn.

Actor selection follows the existing combat UI: order living participants by
initiative order, include hidden and zero-HP-but-not-dead participants, recover
legacy orphan character combatants, and reject an invalid current index. Solo
turn declarations are unchanged. Exact start-phase timing remains a tabletop
declaration; this does not yet automate Guards protections or Sharpened effects.

Validation: local migration applied; seven new real-database scenarios plus the
existing ledger suite (29 passing cases) verify ownership timing, DM/player
behavior, original request replay, death/order cases and ordinary off-turn
bonuses. Security advisors report only existing keep_warm/client_errors findings.
Full gate passed: 2,290 units, TS 203/203, hooks/RAW/coordinates/anchors/build/SW,
254.3 KB entry. Six desktop/phone Guards, Sharpened Mind and secondary-Psion
control scenarios passed. PR158 merged at dd5f78b after both hosted gates passed.


### v2.815 candidate — keep discipline records current during shared combat

The discipline record follows the existing scoped combat subscription, including
turn rewinds, encounter changes and character participation. HP-only changes do
not request another ledger read. A remote turn change preserves an in-flight
outcome confirmation from the earlier turn rather than unlocking its buttons.

A real browser test also found that the campaign-filtered participant listener
missed deletions containing only the primary key. The provider now handles those
notifications by matching already-visible participant IDs; unrelated deletions
do not reload the campaign. No additional database privileges or schema changes.

Validation: 13 focused unit tests cover transitions, rewinds, membership, ignored
HP/name changes, pending confirmations and deletion scoping. Desktop and phone
browser scenarios verify remote advancement/rewind/removal and interrupted
payment recovery (four browser cases). Both desktop/phone combat lifecycle cases
also pass after isolating their fixture from shared seed campaign-slot limits.
Full gate: 2,290 units, TS 203/203, hooks/RAW/coordinates/anchors/build/SW, 254.3 KB
entry. Guards and Sharpened Mind lasting effects remain the next Psion priority.

PR157 merged at 9c3ca2d with both hosted gates green. Its production deployment
was explicitly rate-limited for 24 hours; deployment is not claimed.


### v2.814 candidate — connect all discipline activation controls

All eleven discipline controls now capture the shared turn before rolling and
record the original attempt through the ledger. Conditional bonuses record a
use even when their Energy Die is kept. Guards spends one die without rolling
or offering Surge/Enkindled. The previously missing free-action discipline
buttons now appear. Base costs and turn claims commit together; enhancements
retain their separate Hit Dice costs. Saved recovery notes retain target/INT
context and the final conditional bonus.

Secondary Psion controls now send the original class order to the checked
snapshot, rather than the display-only projection. Effective Intelligence
continues to honor attuned item overrides. Solo End Turn tracks every Psion
from level 2, not only the level-20 capstone. A new three-way modal decision
keeps closing/replacing an outcome dialog distinct from explicitly keeping the
die: dismissal leaves the original outcome pending for later recovery.

Validation: all eleven controls plus secondary Psion checked on desktop and
phone; six additional two-tab, start-of-turn exception and dismissed-outcome
cases passed. Twenty related desktop scenarios passed across conditional dice,
selected Hit Dice, Biofeedback, Destructive Thoughts, Enkindled, Headband cache
and interrupted payment/rest recovery. Earlier tests now advance a real solo
turn between repeated discipline uses. Full gate: 2,286 units, TS 203/203,
hooks/RAW/coordinates/anchors/build/SW, 254.3 KB entry. Screenshots inspected.

CI follow-up: four discipline component suites now explicitly mock the database
client imported through the item-bonus helper. All 46 focused cases pass with
intentionally invalid database credentials; the full gate passes unchanged.
This prevents local environment files from masking missing test isolation.

Remaining: Guards condition removal/immunities/INT-save Advantage and Sharpened
Mind's lasting effects are still manual; activation messages say so. Spell
trigger/visibility and exact start-of-turn timing are tabletop declarations.
The both-specials-plus-one-ordinary interpretation remains documented below.
External combat turn refresh, broader effect settlement and existing sheet
clipping remain queued. This completes the normal controls' turn/cost wiring,
not a claim that every Psion effect is fully automated. Depends on PR155/156;
PR156 gates and preview passed, while production last remained v2.809.


### v2.813 candidate — recover discipline attempts and outcomes

The sheet now reads the shared discipline record and lists unresolved conditional
bonuses, including earlier turns. It can confirm whether a saved bonus changed
the outcome without rerolling or reapplying its effect. An uncertain begin/finish
request stays in browser recovery; its original decision cannot be overwritten
or dismissed. Confirmed solo End Turn refreshes the record immediately. Reads
also refresh on focus and explicit refresh; external combat turn updates are not
yet subscribed directly.

The resource hook freezes every request before queued edits flush. Recovery
rejects payload changes under a saved identity, while allowing semantically
identical key order/omitted optional fields. Discipline receipts acknowledge only
current, revision-ordered Psion resource fields, preserving unrelated edits.

Validation: full gate passed 2,272 units, TS 203/203, hooks/RAW/coordinates/anchors,
build/SW and 254 KB entry. Real desktop/phone tests hold successful outcome replies,
reload, confirm the original decision with exactly one charge, and advance the
solo turn. Screenshots inspected. The official overflow algorithm found no page
sideways scroll or clipping in the changed panel. Whole-sheet reports retain
existing compact/sidebar/Misty Step clipping findings for later polish.

Required next: connect all eleven activation controls to begin/finish, capture
turn context before rolling, and verify competing tabs plus exceptions. Current
activation buttons still use the old Energy Dice path, so complete shared
one-discipline-per-turn enforcement is NOT yet claimed. Browser tests for this
batch create the pending attempt through the real backend, then drive recovery.
PR155 hosted gates passed but preview was rate-limited. Production website was
last confirmed at v2.809 despite the applied discipline database migration.


### Psion discipline client candidate — verified request/response contract

Added typed begin, finish and turn-state calls for the new discipline ledger.
Requests freeze the original rolls, turn, ability/inventory snapshot and outcome
before sending. Responses must match that identity, validate payment counters,
and include current character resources. Historical payment counters remain
separate so a replay cannot overwrite newer resources. Current/pending lists
must agree; malformed or timed-out responses stay uncertain instead of inviting
a new roll. All calls share the existing bounded retry/deadline behavior.

Discipline names and conditional-cost classification now have a shared pure
registry used by the data table and request validation. Full gate: 2,259 units,
TS 203/203, hooks/RAW/coordinates/anchors/build/SW and 254 KB entry. The 53 added
cases cover captured requests, paid/free outcomes, contradictory receipts,
timeouts and cross-list consistency. These calls are not yet wired to buttons
or durable browser recovery; that is the next required integration step.

Release checkpoint: PR154 merged at 17849e03 after both hosted gates and its
Vercel preview succeeded. This includes the preceding map HP preview and Psion
request deadlines. Production migration run 37743138039 confirmed application of
20261008071136_psionic_discipline_turns.sql. The production website build was
rejected by Vercel's build-rate limit; a successful preview did not lift that
production restriction.


### Psion discipline ledger candidate — backend groundwork

A private ledger now records a discipline attempt and its original rolls once
per character/turn. Failed conditional bonuses retain their Energy Die but
consume the discipline use. Base payments, history and claims commit together;
exact retries return the saved outcome with current character resources.
Owners and current campaign DMs share the same claim. Pending conditional
outcomes remain recoverable after a turn changes.

Source: owner's UA2025-Psion+Update.pdf, pp. 3–5. Guards and Sharpened Mind
are distinct start-of-turn exceptions, each preceding an ordinary discipline.
Allowing both exceptions plus one ordinary discipline is our composition of
those permissions, not an explicit three-use statement in the source. Actual
start-of-turn timing still requires a tabletop declaration; this ledger orders
discipline claims but does not track every intervening action. Effective INT
uses the client's modifier against a checked raw ability/inventory snapshot.

Validation: 22 local database cases cover competing tabs, retries, conditional
outcomes, exceptions, multiclass eligibility, owner/DM access, encounter rewind,
and transaction rollback. Full gate: 2,206 units, TS 203/203, hooks, rules,
coordinates, anchors, build, service worker and 254 KB entry. Advisors found no
discipline-specific warning; existing keep_warm/client_errors warnings remain.

Not yet wired into the sheet: the current buttons still use the old payment
path. Next: durable begin/finish requests, all eleven discipline controls,
visible shared turn usage, pending-outcome recovery and desktop/phone checks.


### v2.812 Psion candidate — recover silent resource requests

Psion RPCs now stop waiting after 15 seconds per attempt. A silent response is
classified as an unknown payment, never proof that dice were not charged. The
existing saved-roll/rest recovery remains visible, explicit retry keeps the
original request, and a late success cannot acknowledge or discard that saved
request. Enkindled turn reads also stop waiting, so a stalled check does not
leave the roll flow locked indefinitely. Payment functions clone their input
before awaiting, keeping retries and receipt validation bound to the original
rolls, turn and resource snapshot.

Validation: 44 focused API/recovery cases; real desktop/phone Restoration tests
hold a successful server response until after the deadline, release it late,
reload and confirm exactly one recorded Restoration use. Full gate passed
2,206 units, TS 203/203, hooks/RAW/coordinates/anchors/build/SW and 254 KB entry.

Release checkpoint: PR151 merged at 5f0f9b49, main CI 37741304466 succeeded,
but production Vercel rejected the build for its rate limit. PR152 hosted gates
passed; its preview hit the same limit. No hosting plan change was made.

Remaining Psion audit: the general one-Discipline-per-turn limit is currently
a reminder, not a shared persisted claim. Its Psionic Guards/Sharpened Mind
exceptions and conditional free-roll attempts need source-backed ordering and
end-to-end enforcement; Energy Dice accounting alone does not prove that rule.


### v2.811 map candidate — preview HP adjustments before applying

The token panel previews exact remaining HP and temporary HP before a DM applies
damage, healing or Set HP. It uses the same canonical pool calculation as the
request validation, explains temporary-HP absorption and maximum-HP caps, and
keeps invalid inputs disabled. Changing tokens clears the unfinished amount/mode
so an adjustment intended for one character cannot carry into the next. Primary
HP controls have 44px touch targets; the HP bar exposes its numbers to assistive
technology.

Validation: 11 panel unit cases, both desktop/phone authenticated map recovery
scenarios (including preview math, lost-reply recovery, stale cancellation and
landscape bounds), and inspected phone/landscape screenshots. Full gate passed
2,201 units, TS 203/203, hooks/RAW/coordinates/anchors/build/SW and 254 KB entry.
Candidate depends on the preceding v2.810 branch; not yet deployed.


### v2.810 sheet integration — durable standalone damage and saves

The solo sheet now submits one saved damage identity that pays HP and queues its
concentration check together. It keeps full damage when temporary HP absorbs a
hit, preserves separate checks for separate hits, and accepts only ordered server
HP/concentration receipts. Pending damage locks the HP/rest controls until it is
confirmed or the server proves cancellation. Reloads recover the original hit
and dice; a failed reply never becomes a second hit or a reroll. Saved checks have
no dismiss action. Old-casting checks retire without touching the current spell.

War Caster keeps both dice, captured effective Constitution and total-level
proficiency remain authoritative for that check, and server logs are not written
a second time by the animation. Auto/prompt/off are respected; zero HP ends
concentration without a die even with ordinary saves off. Realtime observers
recognize the atomic damage marker and read the existing queue. Whole-number HP
input now rejects decimals/partial strings rather than removing punctuation.

Validation: 2,198 unit tests; TS 203/203; hooks, RAW, coordinates/anchors, build,
service worker and 254 KB entry budget passed. All 13 scenarios passed on desktop
and phone (26 total), including lost damage/save replies and reloads, multiple
hits, War Caster, zero HP, auto/off, delayed animations/new casts, and two open
sheets. The phone prompt screenshot was inspected. Backend marker regression
coverage passed all 43 compound/manual HP database cases.

Release update: PR150 merged at c1766604; workflow 37740939632 explicitly
applied migration 20261008063321 and finished db push. PR151 contains the
verified UI; its hosted gates passed and its preview is pending. The backend
production frontend build hit Vercel’s build-rate limit; no plan was upgraded.
At this checkpoint the new UI is not deployed.
Campaign damage and external legacy HP writers still need their own durable
consequence integration; this does not certify death-save/instant-death automation.


### v2.810 damage backend candidate — one hit, one concentration identity

apply_standalone_damage composes the existing HP adjustment and concentration
queue under one character lock/transaction. It captures the pre-damage casting,
uses a separate save ID from the HP/history ID, and preserves full damage even
when temporary HP absorbs it. A stale HP or casting snapshot rolls back both
operations. Exact retry returns the original damage receipt plus current character
state; it never charges HP again or rebases the old check onto a newer spell.
The returned check is the original snapshot, not proof it is still pending: the
UI must reload the authoritative queue after confirmation.

The server captures the allowed character automation override (default prompt,
locked overrides ignored). Off suppresses ordinary saves; zero HP/incapacitation
still ends the matching concentration immediately, in the damage transaction.
Cancellation seals both underlying request identities and never reverses a paid
hit. Save identities are unique even when no check was needed. No death-save,
instant-death, campaign damage, or condition-cascade implementation is claimed.

Local validation includes temporary HP, full damage/DC, multiple clients, retry
with later healing/casting, stale snapshots, automation modes, cancellation races,
identity reuse, access control, and rollback when HP or zero-HP concentration
history fails. All 22 database cases passed. Full gate passed 2,170 units, TS 203/203,
hooks, RAW, coordinates/anchors, build/SW and 254 KB entry. Local advisors show
only the standing keep_warm/client_errors warnings.

Client/controller integration remains the next step; the sheet
still uses its legacy damage writer until that work is connected and verified.

Release update: PR149 merged at 7c7be3d2; workflow 37738544820 explicitly applied
20261008061734 and finished db push. PR148 main CI and production Vercel
dwYmjrriJnWZRn9PnCoRT2N1jEM5 succeeded; public SW verified at 2.809.0.
Migration 20261008063321 is local only at this checkpoint.


### v2.810 client groundwork — durable standalone request transport

standaloneConcentration now persists each creation and roll by account, character
and request ID before sending. Multiple hits remain separate. Requests clone their
snapshot; retries keep original identities/dice, coalesce in-flight calls, and
verify returned DC, proficiency, advantage, natural-rule outcome and casting
revision. Saved malformed data is surfaced, not silently discarded. A 15-second
deadline releases hung requests for explicit retry; late responses cannot erase
recovery. Unconfirmed creations are forgotten only after verified creation or
server cancellation proof. Pending/read/result APIs are ready for the sheet hook.

Validation: 24 focused API cases and a real authenticated local browser test of
lost creation and roll responses across reloads; the same pair and one history
entry survived. Full gate passed 2,170 units, TS 203/203, hooks, RAW, coordinates,
anchors, build/SW and 254 KB entry. No visible integration yet; this branch keeps
the transport groundwork until the controller/panel are connected and verified.

Integration must preserve one identity per damage event across live updates and
multiple tabs. Prefer linking pending saves to the atomic HP adjustment rather
than adding another independent HP-delta-triggered request: deltas lose overkill
and parallel observers can duplicate checks. Capture/store before any outgoing
work, retain queued hits, prevent stale results from replacing newer concentration,
and never replay HP to recover a missing save.

Release update: PR148 merged at adfb20aa after both hosted gates/preview passed;
main CI 37737473934 succeeded, its production deployment remains pending.
PR147 main CI 37737090230 and production Vercel APLmdC58XJ1SQWSmZTfSs7bhq7JM
succeeded; public SW verified at 2.808.0. PR149 now includes cancellation and
23 database cases; updated checks/preview are pending before merge.


### v2.810 backend candidate — persistent standalone concentration queue

A private, character-owned ledger now supports queue/read/settle RPCs for saves
outside campaigns. Creation checks the exact casting/stat/inventory snapshot,
uses total-level proficiency and captures damage/DC, modifier, War Caster and the
natural-extreme preference. The effective item modifier follows the existing
paid-roll client calculation contract; the server validates its captured inputs,
not the entire item catalogue. Pending hits remain separate and readable after
reload. Reusing a creation ID with changed arguments is rejected.

Settlement locks character then request, records one winning result, and updates
concentration, action log and character history atomically. Old casts and checks
from before joining a campaign retire without changing the current spell. Zero
HP/incapacitation ends the matching concentration without a die. No HP is changed.
The ledger is not exposed; anonymous and other-character callers cannot read or
resolve it. Twenty-three local DB cases passed, including concurrent clients, separate
hits, snapshot drift, malformed dice, permissions, and rollback of either history
failure. Full gate passed 2,146 units, TS 203/203, hooks, RAW, coordinates/anchors,
build/SW and 254 KB entry. Local advisors retain only standing warnings.

Unconfirmed creation requests can be canceled only with a server receipt; a
tombstone blocks late creation. Existing pending checks/results cannot be canceled
through that API. Stale unsent requests can be dismissed without rebasing them.

Migration 20261008061734 is local only. This is groundwork, not live sheet
integration: add durable creation/roll requests and the recoverable queue UI,
replace the standalone local roll/history writes, and preserve all pending hits.
Linking manual HP damage to this queue atomically, deduplicating realtime echoes,
and carrying damage-time context still require work. Campaign effects use their
existing path; these RPCs reject creating new checks for campaign characters.

Release checkpoint: PR146 merged at f49a5867; main CI 37736018320 and production
Vercel CegocThF7z4F6Ln819YcBSBfwPxQ succeeded. Public SW reports 2.807.0.
PR147 merged at 12227776. Production workflow 37737090158 explicitly applied
20261008060147 and finished db push. Its client deployment/main CI and PR148
release are still pending at this checkpoint.


### v2.809 candidate — War Caster on the standalone sheet

The sheet's own concentration roll now keeps the higher of two d20s for War
Caster. Both dice reach the animation and action log; only the selected die is
added to Constitution/proficiency. Natural-extreme house rules use that selected
die. The prompt explicitly explains advantage and separates its controls from
the explanation, with 44px touch targets and improved contrast on narrow screens.
The prompt was extracted from the sheet root into ConcentrationCheckPrompt.

Validation: seven pure rule cases; all 14 desktop/phone sheet concentration cases
passed, including standard/house-rule extremes, two-die history and preservation
of later castings after delayed animation. Screenshots inspected after fixing the
initial cramped mobile layout. Final gate: 2,146 units, TS 203/203, hooks, RAW,
coordinates/anchors, build/SW and 254 KB entry.

Reliability remains unfinished: this sheet path rolls locally, calls
setConcentration separately, and asynchronously writes action history. It has no
durable pending-save receipt. Replace that whole path with a character-scoped
server transaction, preserving damage-time spell/revision, save bonus, advantage
and every damage event. Avoid a second save from realtime HP changes when combat
already created one; HP deltas also cannot reconstruct overkill damage. The
manual HP receipt should eventually link the same save identity without replaying
HP. Character/account changes, multiple pending hits, lost responses, zero HP,
new casts, and reloads all need coverage. No claim of atomic sheet recovery yet.


### v2.808 candidate — durable War Caster campaign concentration saves

New campaign concentration offers snapshot the character's War Caster feat on
insertion. The server ignores caller-proposed advantage and prevents changing
that flag afterward. Existing offers retain their original roll contract. The
settlement endpoint requires two valid dice for advantage, chooses the higher,
and stores both dice with its result/history in the same transaction. Owner/DM
races and retries return the winning result without repeating effect cleanup.

The client reads the captured setting, saves both dice before settlement, and
reuses them after timeout/reload. An older saved first die is preserved when the
second die is added. The prompt shows advantage and recovery displays both dice.
Legacy clients fail closed on new advantage offers rather than rolling one die.

Validation: 18 local DB cases; 21 concentration API cases; real desktop/phone
advantage recovery passed with lost responses, reload, feat removal and one
history event. All five desktop concentration recovery cases also passed.
Screenshots inspected. Full gate: 2,139 units, TS 203/203, hooks, RAW, coordinates,
anchors, build/SW, 254 KB entry. Local security advisors report only standing
keep_warm/client_errors warnings. Migration 20261008060147 is local only.

Source: 2024 PHB p.209 / [licensed rules](https://roll20.net/compendium/dnd5e/Feats%3AWar%20Caster?expansion=32231).
No feat prose is copied into the app. Standalone-sheet concentration rolls locally; v2.809 adds its advantage math,
but durable settlement remains open. Manual map damage
consequences, other advantage/disadvantage sources, and mobile sheet header
clipping remain follow-ups; this release does not certify those paths.


### v2.807 candidate — effective ability scores in automated saves

Automated character saves now load inventory and reuse the sheet's equipped/
attuned ability overrides. A Psion with an active Headband of Intellect receives
its effective INT modifier; inactive items do not apply and higher base scores
remain intact. Concentration offer creation uses the same effective CON helper.
Seven added regression cases cover these paths, total-level proficiency and the
existing concentration DC cap. Full gate passed: 2,134 units, TS 203/203, hooks,
RAW, coordinate/anchor checks, build/SW and 254.0 KB entry. No item catalogue
entries or source rules changed.

Remaining concentration work: standalone-sheet War Caster advantage is still
unimplemented; the campaign contract is extended in the v2.808 candidate above. Manual map damage currently changes HP only.
Linking it to concentration needs a damage-time spell/revision snapshot and an
idempotent offer: replaying an old HP receipt must never test a newer casting.
Zero-HP/death consequences and cross-device effect settlement also remain open.


### v2.806 candidate — reliable HP controls on the battle map

The live character quick panel now uses the manual HP transaction instead of a
stale absolute update. Set HP accepts zero, damage consumes temporary HP first,
healing caps at max HP, and invalid amounts cannot submit. Temporary HP is visible.
The input clears after confirmed success. The panel stays inside short landscape
viewports and scrolls its remaining controls.

Captured adjustments persist by account/character before sending. Reopen/reload
and retry reuse the same identity. A hung call times out visibly; its late result
cannot overwrite another character or erase a newer request. Cancellation needs
server proof; already-paid adjustments resume instead. Current HP revisions order
receipts, and incoming HP/temp/revision changes refresh the panel. No optimistic
HP writes or legacy write fallback remain in this control.

Backend PR144 merged at 4bbc5b29. Production workflow 37734145365 explicitly
applied 20261008053426 and finished db push. Main CI 37734145419 and production
Vercel 7wr6UEJRYjcxGXf12cbRLrSNNv2k succeeded. Twenty local DB cases cover revision
races, exact retry, cancellation, ownership, history rollback and HP arithmetic.
Security advisors show only the standing keep_warm/client_errors warnings.

Client validation so far: 21 focused API/UI cases; actual desktop/phone map flows
passed setting zero, temporary HP, lost responses, reload/retry, stale revision
cancellation, and landscape bounds. Phone/landscape screenshots inspected. Final
release gate passed 2,127 units, TS 203/203, zero hook violations, RAW/map math,
build/SW and 254.0 KB entry. Client PR145 merged at 0e2ba279 after both CI gates and Vercel preview passed.
Main CI 37734946053 succeeded. Production Vercel
62pCzxKU2V3xUjSF5CHUQ1BWvo2V succeeded; the public service worker was independently
verified at 2.806.0.

This is manual HP adjustment, not the entire combat damage resolver: concentration,
death saves and condition consequences remain a distinct integration boundary.
Further work must connect the relevant combat consequences without replaying HP.

### v2.804 deployed — verified casting recovery

PR142 merged at 56b7c5ae. Main CI 37732857038 and production Vercel
9RVisYPJxb37qyMdLdH1SbSNnnem succeeded; public service worker reports 2.804.0.
PR143 merged at ff242fd4 after both GitHub gates and Vercel preview passed.
Main CI 37733534514 and production Vercel HAqp3ox4M3FRTJb9k2ET54svFCFg
succeeded; public service worker independently reported 2.805.0.


### v2.805 candidate — keep melee reach visible after viewport recreation

ReachOverlayLayer created new Graphics when the viewport changed, but its drawing
effect depended only on hover data/grid size. An already-hovered attack therefore
stayed invisible on the new viewport. Redraw now follows viewport identity, and
already-destroyed viewports never receive new Graphics. Four focused component
cases cover delayed availability, replacement/cleanup, destroyed scenes and hover
exit. Full gate passed: 2,092 units, TS 203/203, hooks, RAW, coordinate/anchor
checks, build/SW and 254.0 KB entry. This does not change attack eligibility math.


### v2.804 candidate — recover paid casting and safely cancel unpaid requests

The sheet owns durable recovery independently of spell rows. Captured source,
ability, DC and request identity survive reload, last-slot use and preparation
changes. Queued character edits flush before the transaction pays the slot. The
modal is presentation-only; recorded Counterspell saves use verified settlement,
including the original slot refund when its save fails.

Unconfirmed casts can be canceled only with a verified server receipt. A tombstone
blocks delayed payment, including after a lost cancellation response. Already-paid
casts resume instead. A late old response cannot erase a newer pending request.
The phone error state no longer shows a fictitious reaction countdown.

Deferred effects share normal casting choices. Browser locking and a durable
started marker prevent automatic replay after interruption; partial effects require
explicit review. Cross-device atomic effects, persistent turn/action usage, wider
declaration coverage (attack/heal, compact mode and cantrips), and sight/components
remain follow-ups. This release does not claim those are finished.

Validation: full gate 2,088 units, TS 203/203 (ratcheted), zero hook violations,
RAW/coordinates/anchors/build/SW and 254.0 KB entry. Six local desktop/phone cases
cover lost responses, reload, last slot, removed preparation, actual client save/
settlement, and cancel/recast. Two focused visual checks passed after correcting
the error wording. v2.804 build and service-worker version synchronized.

**Release pending:** PR141 merged at 96942719. Production workflow 37732224515
explicitly applied 20261008051748 and finished the database push. Production UI is
still v2.803 until the candidate's PR/deployment checks finish.

### Backend applied — cancel unpaid casting without delayed charges

Migration `20261008051748_cancel_unpaid_spell_declaration.sql` adds an explicit
owner/current-DM cancellation receipt and private request tombstone. Declaration
and cancellation serialize by request ID before existing cast/character locks,
including when neither row exists yet. A canceled ID cannot later pay a slot;
an existing paid or legacy declaration is preserved and returns canceled=false.
Retries preserve identity and permissions. Source/encounter changes do not trap
an unpaid request. No public table access or resource-write fallback was added.

Local validation: 28 database cases passed (10 new cancellation cases), including
concurrent declaration/cancel, concurrent cancel retries, delayed and cross-character
requests, permissions, legacy casts, and unchanged payment/refund regressions.
Full gate: 2,030 unit tests, TS 204/204, hooks/RAW/coordinates/anchors/build/SW
and 253.7 KB entry. Local migration applied; security advisors have only the
existing keep_warm/client_errors warnings. Production workflow 37732224515 applied
the migration successfully. The v2.804 client above is wired and browser-verified;
its pull request and deployment remain pending.


### Backend applied — durable casting requests and retry-safe Counterspell prompts

PR140 merged at a36f9b2f. Production workflow 37729372230 explicitly applied
20261008043752 and finished db push. Main CI 37729372254 and production Vercel
passed. The browser is still v2.803; the paid-casting UI has not shipped.

Migration `20261008043752_counterspell_offer_retries.sql` adds a narrowly
caster/DM-authorized transaction. Retries lock the same declaration and reuse
its prompts, preserving declined/expired responses and the original deadline.
The caller supplies candidate IDs only; names, campaign, spell and expiry come
from the stored cast/participants. Foreign encounters, self-targeting and stale
caster links fail. Current preparation/source, available slots, reaction use,
canonical HP/conditions and encounter status are checked before inserting.
Existing map-distance candidate filtering remains a client responsibility;
perceptible components and sight are still separate follow-up work.

Repository APIs now capture a paid cast before sending, scope its durable request
by account/character, reuse identical arguments after a lost response, validate
receipts, and refuse to erase a newer or corrupt request. The server settlement
API never infers a refund for an old declaration without a payment receipt.
Prompt requests likewise coalesce/retry without loose insert fallbacks.
**These new APIs are not connected to the casting UI yet.** The existing player
flow is unchanged until backend production application is confirmed and the
recovery/effect lifecycle is wired and browser-tested.

Validation: 37 new request/API units; full gate 2,030 unit tests, TS 204/204,
zero hook violations, RAW/coordinates/anchors/build/SW and 253.7 KB entry.
All 50 local database cases passed across prompts, acceptance and settlement.
The new 17 prompt cases cover concurrent retries, declined/expired offers,
actual player visibility, foreign candidates, spent/incapacitated reactors,
source/preparation changes, and rollback after a failed insert. Initial fixture
failures were corrected to include actual campaign membership and avoid violating
the existing unique-participant constraint. Local ledger has no pending entries;
security advisors show only existing keep_warm/client_errors warnings.

Next: connect the durable declaration/modal, remove its separate slot debit,
route recorded Counterspell saves through settlement, and preserve post-cast
choices without replaying summons/buffs after reload. Do not equate slot recovery
with full spell-effect recovery or claim the whole Counterspell lifecycle done.

### Backend applied — paid spell declaration and safe slot settlement

PR139 merged at e70f928c. Production workflow 37728301600 explicitly applied
20261008041620 and finished db push. Main CI 37728301590 and production Vercel
passed; the browser remains v2.803 until the new paid-casting client is connected.

Migration `20261008041620_declared_spell_slot_settlement.sql` adds two explicitly
caster/DM-authorized private transactions behind invoker RPCs. A stable cast ID
records one declaration, slot debit, context, event and private payment receipt.
Settlement derives the result from the linked, recorded Counterspell save, never
from a caller-supplied outcome. Failed saves return the original caster's paid
slot once; successful saves and expired uncontested windows keep it spent.
Cantrips never invent a slot. The counterspeller's own slot remains spent.

Server-owned per-level recovery revisions distinguish an old refundable debit
from slots already recovered by a rest/manual change. A later cast after a rest
cannot be erased by an old refund. Refunding one of several pending spells at
one level preserves each remaining spell's own refund; changes at another level
do not invalidate it. The revision trigger is invoker and rejects fabricated
revision updates. No refund is inferred for legacy declarations without receipts.

All 18 new authenticated database cases passed; the combined final suite passed
52 cases covering settlement, Counterspell acceptance, and existing Hit Dice
healing. Cases include concurrent declaration/settlement, rest-then-spend, separate
same-level refunds, failed history inserts rolling everything back, stale slots,
unprepared/orphaned sources, incapacitation, outsider denial, and substituted saves.
Full gate passed: 1,993 units, TS 204/204, zero hook violations, RAW/coordinates/
anchors/build/SW and 253.7 KB entry. Local ledger has no pending entries. Security
advisors show only the two existing keep_warm/client_errors warnings.

This is an additive backend rollout. The next client change must capture a
stable declaration before queued saves, stop its separate slot debit, preserve
wasted action use, settle through the RPC, and recover interrupted declarations.
Component visibility, spell coverage, action-economy persistence and deferred
spell effects after reload still need verification. No claim of full automation.

### Released — transactional Counterspell client, v2.803

PR138 merged at 39fde16b after both hosted gates and preview passed.
Main CI 37727083104 and production Vercel passed; public SW 2.803.0 confirmed.

The reaction client now calls the deployed acceptance transaction instead of
independently spending a slot/reaction, creating a save, linking another caster,
and updating the offer. The canonical offer supplies the cast identity; a
caller payload cannot substitute it. One captured source/modifier/stat/item/slot
snapshot is reused for a transport retry. Identical in-flight requests coalesce;
changed choices and mismatched receipts fail, and there is no loose-write fallback.
The surrounding reaction engine does not overwrite the accepted receipt afterward.

A real browser assertion first reproduced the old paid-but-unlinked spell
(state remained declared after the reaction was accepted). It passes through
the transaction on desktop and phone. Four final browser cases passed, including
aborting the first response after the server committed, then verifying identical
retry arguments, one paid slot, one receipt/reaction event, and a linked cast.
Phone UI inspected. All 19 focused client/delegation tests passed. Final v2.803
gate passed: 1,993 units, TS 204/204, zero hook violations, RAW/coordinates/anchors,
build/SW version, and 253.7 KB entry. New API files are lint-clean.
The required backend migration is confirmed applied before this client release.

Original caster slot retention and final settlement still require follow-up.
Also preserve the wasted action when countered, review the one-slot-per-turn
limit when no slot was actually expended, and recover deferred casts after a
reload/closed dialog. Full Counterspell spell coverage is not yet certified.

### Backend applied — atomic Counterspell acceptance

PR137 merged at 61df07c. Production workflow 37726373833 explicitly applied
20261008040058 and completed db push successfully; this was not a secret-gate skip.

Migration `20261008040058_atomic_counterspell_acceptance.sql` adds an invoker
RPC backed by a private, explicitly owner/DM-authorized transaction. One locked
acceptance spends the selected slot/reaction, creates the CON save, links it to
the other caster, accepts the offer, and records both combat events and an
immutable receipt. Direct arbitrary edits to another caster remain disallowed.
Exact retries return the same attack with current slots; competing reactions
cannot both pay for one cast. Changed retries and stale stat/item/source/slot
snapshots fail. Closed/expired offers/casts, stopped encounters, spent reactions,
incapacitated/zero-HP reactors and cross-campaign substitutions are rejected.
Effective modifiers use captured inputs from the existing shared item pipeline;
the server derives proficiency/DC rather than accepting a supplied save DC.

All 15 local authenticated database tests passed, including real competing
reactors, identical concurrent requests, a forced history failure rolling back
all writes, owner/DM access, and outsider/anonymous/private-ledger denials.
The history fixture initially found the player/character event-type mismatch;
it was fixed before this candidate. The incapacitation fixture was corrected to
edit the canonical combatant state rather than the legacy character mirror.
The full gate passed (1,985 unit tests, TS 204/204, zero hook violations,
RAW/coordinates/anchors/build/SW and 253.7 KB entry). Local migration ledger has
no pending entries. Security advisors report only the pre-existing keep_warm
search-path and client_errors insert-policy warnings.

This was an additive backend rollout; v2.803 above connects the client only
after the production apply was confirmed. Original-caster slot retention/settlement,
perceptible-component eligibility, and broader spell-declaration coverage remain
active follow-up work. Existing older absolute slot writers remain a concurrency
boundary outside this transaction.

### Released — Counterspell casting sources and DC, v2.802

PR136 merged at 8c1120c after both hosted gates and preview passed. Main CI
37725720813 and production Vercel passed; public SW 2.802.0 confirmed.

Counterspell now uses the reacting character's selected spellcasting source,
effective ability modifier (including active ability-setting items), and total
multiclass proficiency. The interrupted spell's level and the slot used for
Counterspell do not alter its DC. Offers and acceptance reuse the sheet's
reviewed ownership/preparation rather than treating a known spell as prepared.
The reaction prompt loads current choices, requires an explicit shared-source
choice, blocks unavailable slots, and recovers from failed/hung reads with retry.
Acceptance checks source, slot and still-declared cast before spending.

Desktop/mobile real-player checks selected Sorcerer DC 17 versus Psion DC 16
for the same ninth-level target, upcast Counterspell without increasing its DC,
and verified the recorded CON save and exactly one selected-slot expenditure.
The phone source picker was inspected. Focused tests also cover effective
Headband INT, missing sources, unprepared spells, stale choices, failed/reopened/
hung lookups, invalid slots and already-resolved casts. Two standing type errors
were removed; CI baseline is ratcheted from 206 to 204. Final v2.802 gate passed:
1,985 unit tests, TS 204/204, zero hook violations, RAW/coordinates/anchors,
build/SW check and 253.7 KB entry. New files are lint-clean. No migration.

**Next: complete Counterspell lifecycle transaction.** The existing reactor
client cannot update another caster's pending_spell_casts row under current RLS;
its attack-link write can affect zero rows. The target also currently pays its
slot at declaration and receives no refund when countered. These are pre-existing
open issues, not covered by the successful DC/slot-choice browser checks. Replace
the scattered acceptance/settlement writes with an authorized, idempotent database
transaction; cover concurrent reactors, expired offers, stale slot/reaction state,
interrupted response recovery, and the caster's retained slot after a failed save.
Also audit perceptible components (including Psion waivers), line of sight and
cantrip/attack-spell declaration coverage. Do not claim full Counterspell automation.
Rule source: https://www.dndbeyond.com/spells/2619072-counterspell

### Released — spell targeting recovery and single dialogs, v2.801

PR135 merged at f875f5d after hosted gates 37724508181/37724504287 and
preview passed. Main CI 37724966306 and production Vercel passed; public SW
2.801.0 confirmed.

Player weapon and area-save spell pickers now share one strict map-loading hook
and recovery notice. Spell selection/declaration and automatic area selection
wait for complete geometry; failed or hung reads offer retry and cannot silently
spend a slot with missing cover. Reopening a persistent dialog checks again.
Successful no-map play and deliberate manual area-target selection remain intact;
this does not claim range enforcement for every creature inside an area spell.

The real spell browser path uncovered duplicate area-save dialogs: compact Cast
mounted its picker both inside the button branch and at the shared footer. The
multi-beam branch had the same error. Both branch copies are removed; each path
has one shared mount. Two regressions observed two dialogs before the fix, one
afterward, and cancel without spending slots. The failed-map regression also
failed before the fix. All 39 focused tests and four desktop/mobile real-player
weapon/spell checks passed; phone spell retry UI was inspected. The browser
checks verify no pending attack and no slot spent during loading/failure/retry.
Final v2.801 gate passed: 1,959 unit tests, TS 206/206, zero hook violations,
rules/coordinates/anchors/build/SW-version and 253.7 KB entry. All four final
versioned desktop/mobile browser cases passed. New shared files are lint-clean.
No migration.

### Released — secondary Psion Actions with missing slots, v2.800

PR134 merged at e002e778 after both hosted gates and preview passed.
Main CI 37724185332 and production Vercel passed; public SW 2.800.0 confirmed.

Actions no longer hides ready spell rows just because the primary class is
martial and imported slot records are empty. Known cantrips remain available;
leveled spells still display No Slots and receive no invented spell slots.
The existing Spells source-review controls remain accessible. The change removes
a redundant class gate from the root rather than adding another caster classifier.

A real Fighter/Psion fixture reproduced the missing Light row before the fix.
Four desktop/mobile checks passed for both class orders; the phone Actions view
was inspected. Final checks additionally cast Light and verify one logged cast
without changing the empty slot map. All eight final desktop/mobile checks passed,
including existing source-review and preparation eligibility cases. Final v2.800
gate passed: 1,953 unit tests, TS 206/206, zero hook violations, rules/coordinates/
anchors/build/SW-version and 253.7 KB entry. No migration or automatic slot repair.

### Released — reliable target distance loading, v2.799

PR133 merged at b6f7737; main CI 37723877544 passed. The public service
worker reports 2.799.0; the subsequent v2.800 release also includes this fix.

Player attack targets wait for map distances before becoming available. Results
are scoped to the current campaign and scene; a stale response cannot unlock a
new picker. Failed map/settings/token/wall reads stay blocked with Try again,
instead of masquerading as no map or switching to stale legacy positions.
A hung lookup offers retry after 15 seconds and ignores a later response.
Successful no-map/unplaced-token play remains available. These stricter reads
are opt-in for the player attack picker; other targeting dialogs are follow-up.

The new regression failed before the fix. Focused tests cover initial loading,
scene/campaign changes, failure/retry, no-map play and underlying read failures.
An isolated real player/encounter browser fixture verifies delayed reads, 503
responses, retry and a 40-foot target blocked from a melee attack on desktop and
phone. Both passed; phone recovery UI was inspected. The harness blocks service
workers for request interception and allows the client's existing GET retries.
Existing two-client movement passed on desktop and on a mobile repeat; the first
mobile run missed a transient pending-save notice, so this is not a clean full
movement-suite pass or evidence of a reproduced product movement failure.
Final v2.799 gate passed: 1,953 unit tests, TS 206/206, zero hook violations,
rules/coordinates/anchors/build/SW-version and 253.7 KB entry. Both final
versioned desktop/mobile attack checks passed. No database migration.

### Released — recoverable Short Rest healing, v2.798

PR132 merged at c53a198; main CI 37722785544 and production Vercel passed.
The public service worker reports 2.798.0.

Hit Dice healing now uses the deployed transaction for every class. The sheet
flushes prior edits, captures the selected size, rolls and effective CON once,
and accepts ordered HP/Hit Dice receipts without another absolute-value write.
The database owns both history entries; the dice animation does not duplicate
logging. New realtime/saved acknowledgments also keep maximum HP current and
cannot replace newer damage with an older healing response.

An uncertain result survives reload in Rest with Confirm saved healing. New
healing, allocation review and finishing/taking another rest stay disabled until
confirmation or explicit dismissal. Confirmation uses the identical request and
refreshes current counters; it never rolls again or reapplies the original heal.
A later rejection cannot prove that an earlier lost response was unpaid, so it
retains recovery. This also tightens existing Psion payment recovery.

New Psion rest snapshots capture available HP, Hit Dice and Energy Dice revisions,
rejecting intervening changes even when a value returned to its original number.
Legacy saved rest requests remain valid and are retried exactly. A local database
case verifies the revision guard; no additional migration is needed.

Before the final versioned gate, 20 desktop/mobile existing recovery/rest checks,
10 integrated mixed-class/rest checks, and 10 new interrupted-healing checks
passed. The new cases cover Psion/Fighter, lost responses, a later rejection,
reload, later damage, delayed acknowledgments and exactly one history event on
each read surface. Phone saved/confirmed screenshots were inspected. An old
Surge recovery harness intercepted the superseded endpoint; it now intercepts
the selected-pool endpoint and verifies the selected die in the request.
Final v2.798 gate passed 1,942 unit tests, TS 206/206, zero hook violations,
rules/coordinates/anchors/build/SW-version and 253.7 KB entry. New files have
no lint findings. All 30 versioned recovery/rest browser checks passed. Final
review found that campaign History would show the transaction's legacy mirror
and a vague unified entry. A dedicated formatter now shows original faces, CON,
selected size and actual HP change; only the exact verified request-id mirror
is hidden. Fallback legacy history remains when unified history is unavailable.
Two additional desktop/mobile History checks passed and the unobstructed phone
screenshot was inspected. No history rows were deleted or rewritten.

Remaining boundary: manual absolute HP edits, non-Psion full-rest writes and old
clients still need broader transaction consolidation. New healing requests are
atomic and ordered; do not describe every character mutation as concurrency-safe.

### Backend applied — atomic Hit Dice healing

Migration 20261008025100 adds a server-owned HP revision and spend_rest_hit_dice.
The new endpoint locks an owner/DM-authorized character, checks the captured HP,
Hit Dice revision, CON and inventory, then commits chosen-pool spending, capped
per-die-minimum healing and both existing history surfaces together. A private
receipt ledger makes identical retries safe, including two concurrent requests.
Changed payloads under the same request id fail. Replayed receipts retain the
original rolled/gained result but return the current character/revisions, never
an old HP snapshot. HP revision advances on HP/max/temp changes; ordinary edits
cannot fabricate it. Its trigger stays SECURITY INVOKER. The new transaction's
privileged boundary authorizes the character before reading any receipt; anon
cannot execute it and authenticated users cannot access its private ledger.

Effective CON remains calculated by the client equipment pipeline, like the
submitted dice; the transaction validates modifier bounds and freezes the base
stat/inventory context rather than inventing a second server item calculation.
This is not an anti-cheat boundary: authorized owners/DMs can already edit HP.

Full gate passed 1,881 unit tests, TS 206/206, zero hook violations, rules,
coordinates, anchors, build/SW-version and 253.7 KB entry budget. All 32 local
DB transaction and existing allocation/Surge cases passed.
Locally applied with no pending migrations. Security advisors retain only the
existing keep_warm search-path and client_errors insert warnings. Tests cover
owner/DM/unrelated/anon access, mixed/non-Psion pools, stale context including HP
returning to its old value, changed and concurrent retries, last-die competition,
zero/full HP, per-die minimum, capped healing, malformed rolls, protected ledger,
server-owned revisions and rollback when history fails.

PR #131 (`67c7b56`) passed both CI gates and preview, then merged as `208fd84`.
Production migration run 37720583173 actually applied 20261008025100. Main CI
37720583102 passed; production deployment 2wWSrY5R7Dg5VkoPm71Dife7YzTV succeeded.

The client release is tracked above. Ordinary absolute-value edits and older
clients retain their existing save behavior; the new transaction does not make
all HP writers atomic. Consolidating manual HP changes and non-Psion full-rest
writes remains a follow-up.

### Released — preserve magic-item ability effects, v2.797

The magic-item database mapper omitted abilityOverride. Loading Inventory could
replace a canonical Headband/Gauntlet/Belt entry with one lacking its stat effect.
Preserve the existing static rule only for its exact canonical SRD id and null
owner; database display/bonus values still win, and homebrew/expansion collisions
never inherit an SRD effect by name. No new item mechanic or migration is added.
The [2024 item rules](https://www.dndbeyond.com/sources/dnd/br-2024/magic-items-a-z)
confirm the Headband's fixed Intelligence score while worn and attuned, retaining
a higher natural score. Existing attunement/equipment guards continue to apply.

Four mocked-cache tests reproduce the lost metadata then verify the fix, including
higher scores, unequipped/unattuned items, noncanonical collisions and database
values. Four desktop/mobile tests exercise both Psion class orders: load the
catalogue through Inventory, then verify Propel DC 15 and Biofeedback's 1d8 roll
of 1 + INT 4 = 5 temporary HP, spending exactly one Energy Die. The catalogue
response is supplied only to each test browser; shared canonical rows are not
modified. Actual character payments use disposable local DB characters.

Final versioned gate passed 1,881 unit tests, TS 206/206, zero hook violations,
rules/coordinates/anchors/build/SW-version and entry 253.7 KB. Mobile screenshot
inspected. PR #130 (`3a95c9c`) passed both CI gates and preview, then merged as
`115c48a`. Main CI 37719604559 passed; Vercel production deployment
C4W55j7JiUCGZqts2xR9bfFyVMiz succeeded and public SW 2.797.0 was confirmed.

### Released — mixed-class Hit Dice, v2.796

Hit Dice now pool by size across both classes. The Rest controls display every
pool, let the player choose its die size, and use the same allocation as Psionic
Surge. Healing uses current effective CON and the 2024 minimum of 1 HP per die.
An exhausted selected size stays selected and disabled; the app never silently
charges a different pool. Equal-sized classes share one pool.

Old partly spent mixed-class totals cannot identify the original sizes. A review
panel asks the player to allocate the already-spent total, preserving total/HP,
with revision checks and visible stale-save errors. Unknown allocation blocks
new healing/Surge instead of guessing. Empty/full/single-size totals are inferable.
Surge keeps its selected size in durable saved requests, charges it atomically,
and retains compatibility with old pending requests. Receipts update allocation
and aggregate together and reject stale revisions. Long Rest clears allocation;
Enkindled's pure-Psion pool remains inferable after its legacy receipt.

Schema PR #127 (`c8eff72`, merge `a0aced9`) is live: production migration run
37717155626 actually applied 20261008020231, and main CI 37717155571 passed.
Real healing checks exposed an invoker permission gap in the revision trigger.
Follow-up PR #128 (`45fd20f`) keeps invoker/RLS behavior and moves pure validation
into the existing private schema, with revoked public forwarding helpers. It is
applied locally as 20261008022337, with no pending migrations. All 14 allocation
DB cases passed; security advisors report only the existing keep_warm path and
telemetry insert warnings. PR #128 passed both CI gates and its preview, then merged as `d00b2f8`.
Production run 37718318834 actually applied the permission migration; app release
remains separate. Main CI 37718318850 passed.

Final versioned gate passed 1,877 unit tests, TS 206/206, zero hook violations,
rules, coordinates, anchors, build/SW-version and 253.7 KB entry budget. The
unused old roll shim is removed; TS_BASELINE is ratcheted to 206. All 42 desktop/mobile and database cases passed across the final desktop and
corrected mobile runs: both class orders, review, cancellation, chosen
Surge/healing, reload, Long Rest, single-class healing and Enkindled. Screenshots
inspected for mobile chooser and mixed rest controls. The mobile check exposed
a real last-action obstruction: .app-content padding did not apply to the sheet.
Phone sheet clearance now reserves navigation plus dice/history-button space,
and the browser test verifies the action receives clicks. Four final versioned
desktop/mobile tests passed after strict Surge receipt validation. Saved requests
retain their selected die size. PR #129 (`5cfaa4f`) passed both CI gates and preview, then merged as `527a4d3`.
Main CI 37718957422 passed; Vercel production deployment
9JkCWPbBKdzavDpA4stZxNQoKdeD succeeded, and the public service worker reports
2.796.0. The controls are live.

The chosen-pool healing transaction and original-roll recovery are implemented
in the v2.798 candidate above. Broader ordinary HP edits and non-Psion full-rest
writes remain queued; those paths still need transaction consolidation.

### Released — Short Rest healing numbers, v2.795

The [2024 Short Rest rule](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/)
applies Constitution and the 1 HP minimum to each spent die. Batch healing
previously clamped only the combined total: rolling 1 and 6 with CON -3 gave
2 HP instead of 4. A shared pure rule corrects this; sheet healing now uses the
effective Constitution modifier. Zero available dice, zero HP, full HP and a
frozen sheet cannot trigger a healing spend. Nineteen rest-rule tests and four
desktop/mobile browser checks passed; browser test verifies 1 HP becomes 5 HP
for those two rolls, spends exactly two dice and survives reload.

Full versioned gate passed: 1,823 unit tests, TS 207/207, zero hook violations,
RAW/coordinates/anchors/build and version checks, entry 253.7 KB. Mixed-class Hit Die pools and their shared
spending with Surge/Enkindled Life Force need separate persisted tracking; that
larger follow-up is not solved by this arithmetic correction. Existing rest
writes also remain separate from all related healing/history effects.

### Released — spell casting sources, v2.794

[2024 multiclass rules](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character)
associate casting ability with the spell's class. Current card stats, cast buttons,
and repeated concentration actions instead consume primary-class stats in separate
places. Shared prepared copies require explicit source choice, even if their
abilities match, because class-specific bonuses differ.

The source picker now drives Actions and Spells stats, casts, healing and
Psion-only cantrip bonuses. Missing ownership offers inline review; species,
feat and other sources require the ability specified by that feature.
Concentration records the chosen source/ability, and recurring effects use it.
An exact request is persisted before any queue flush; retries never rebase over
another cast or spend another slot. Corrupt local requests can be explicitly
discarded without deleting a newer valid request.

Schema PR #124 (`4e44062`) merged as `df3b9ca`; production migration
`37713138646` and main CI `37713138771` passed. All 22 local schema/identity
checks passed. Final full gate passed 1,816 tests, TS 207/207, entry 253.7 KB.
Twelve desktop/mobile casting tests passed with both class orders, cross-tab
choices, reload and lost-response retry; source/DC, slot count and remaining
duration verified. Manual concentration also confirms without serializing display
metadata into the durable request. Final desktop/mobile screenshots inspected. Eighteen existing
concentration, ownership and preparation browser checks also passed.

Two tests reproduced post-cast target pickers being unmounted by concentration
saving. They now survive save locks and last-slot spending in both sheet modes;
all four regressions pass. A late receipt cannot erase another tab's newer saved
request. Existing old-spell summon/aura cleanup remains best-effort client work;
server-atomic cleanup and atomic slot/effect settlement remain follow-up work.
Do not claim those are guaranteed. PR #125 final head `1936d92` passed both
CI gates and preview, merged as `9c18559`. Main CI `37715637542` passed;
public service worker confirmed 2.794.0. PR #126 (`bddbdad`) passed both gates
and preview, merged as `273b915`; main CI `37716010939` passed. Public service
worker now confirms 2.795.0, including both casting and rest corrections.

### Released — ruler scene teardown, v2.793

Two focused tests reproduced null-scale crashes when mounting against an already
destroyed scene or receiving its final frame callback. Ruler mounting, pointer
conversion and redraw now skip destroyed viewports/display objects; cleanup
still removes listeners. Replacement scenes retain the correct measured path.
Both lifecycle tests and nine label-position tests pass. Full gate passed with
1,769 unit tests, TS 207/207 and a 254 KB entry; all four desktop/mobile ruler
zoom/edge checks passed. Mobile screenshot inspected. PR #123 (`e9fb07a`) passed both CI gates and
preview deployment; merged as `5475e75`. Main CI `37712152903` passed and cache-busted public service worker confirms
`2.793.0`.


### Released — Psion multiclass automation, v2.792

Owner-provided UA Update p.2 grants features by Psion level, regardless of
class order. The shared progression resolver now validates either position and
uses the matching subclass. Restoration, Surge, powers, discipline controls and
Reserves use the correct level; total levels still govern proficiency/Hit Dice.

Secondary Psion Actions and Features reuse the existing feature controls with a
read-only class context. The stored primary class remains unchanged, and species
and feats are not duplicated. Individual and party rests recover both classes'
resources at their own levels. Short Rest restores one Energy Die without
refreshing meditation; Long Rest restores its availability. Ordinary saves and
realtime receipts preserve paid Psion resources in either class order.

Database migration `20261008005154` preserves ownership, row locks, replay and
history while updating energy/rest/Surge/subclass eligibility and Reserves.
All 68 local database checks pass, including both-order Restoration races, Surge
limits, rest replay, stale saves and authorization. Schema PR #121 (`2343c492`)
merged as `2896015`. Production migration run `37710992296` applied the file
successfully before the dependent controls release.

The full local gate passed with 1,767 unit tests, TS 207/207 and a 254 KB entry.
All 28 final desktop/mobile checks passed without retries, including secondary
Psion meditation from Actions and Features, correct INT-save DCs, Surge costs,
persistence, daily limits and party-rest recovery after unknown responses.
Desktop/mobile screenshots inspected. The final versioned gate passed.
App PR #122 (`778863b`) passed both CI gates and preview deployment; merged
as `70b8f30`. Main CI `37711552765` passed; cache-busted public service worker confirms
`2.792.0`. Follow-up: per-spell multiclass casting ability/source
selection and the general mixed-class Short Rest Hit Die chooser still need
separate audits. Confirmed casting call sites: SpellsTab card stats and sheet
manual/targeted spell paths still consume character-wide computed spell stats;
fix them together so displayed DC, actual save/attack and healing modifier agree.

### Released — map detail and stability, v2.791

Map uploads previously discarded source detail by baking to the scene's world
pixel size (a 10×10 scene became 700×700 even with a 2400-pixel original).
Exports now preserve native detail for Fit/Crop within the existing 4096-edge,
roughly 8-megapixel ceiling. Grid dimensions, token coordinates and map framing
stay unchanged. The preview shows the saved resolution. Existing low-resolution
uploads need the original image re-uploaded to recover lost detail.

Local browser coverage exposed two scene teardown failures: navigation read a
destroyed Pixi transform, and an obsolete hover-preview listener cleared a
destroyed graphic. Navigation and camera history now ignore disposed renderers;
the hover preview, disabled since v2.359, is removed along with its empty graphics
and pointer/animation listeners. Active token drag previews remain in TokenLayer.
Component regressions cover already-destroyed mounts, late zoom/pointer/keyboard
events, history callbacks and recovery with a replacement viewport.

All 14 desktop/mobile browser checks pass without retries; preview and applied
artwork screenshots inspected. Full gate passes: 1,734 unit tests, TS 207/207,
required rules/map/hooks/build checks and 254 KB entry. PR #120 merged as
`836b5f02` after both CI runs (37709333433, 37709336994) and Vercel preview
passed. Main CI 37709719618 passed; cache-busted public service worker confirms
2.791.0.
Further lifecycle audit: active ruler refresh
still reads the viewport transform directly and needs its own focused coverage.

### Released — standalone healing and spell history, v2.790

Standalone healing previously accepted only bare dice, so Cure Wounds with
`+ MOD` did nothing; the Spells-tab modal offered no healing roll. Both tabs now
use the existing healing parser/roller, offer a slot choice, use that slot’s
healing table and effective casting modifier, and spend one slot. Canceling
spends nothing. Flat healing records its amount without an invented die roll.
Standalone healing remains a tabletop roll; it does not select or modify HP.

The remaining spell cast/attack/heal/save log calls now identify the character
rather than the account, fixing foreign-key failures. Untargeted spell attacks
no longer claim a hit against an invented AC of 10. Local desktop/mobile tests
verify Metamorph Cure Wounds at level 2 (4d8 + INT), exact slot persistence,
cancellation and Mage Hand history. Ten combined desktop/mobile checks pass;
two focused follow-ups verify the final healing preview. Screenshots inspected.
Full gate: 1,727 unit tests, TS 207/207 (baseline ratcheted down), required
rules/map/hooks/build checks and 254 KB entry all pass. PR #119 merged as
`08ed0971`; main CI 37683149634 passed. Cache-busted public service worker
confirms 2.790.0 (the unversioned URL briefly served the previous CDN copy).


### Released — cantrip damage and Potent Thoughts, v2.789

Verified against owner-provided Psion Update p.10: level-6 Telepath adds INT
to damage from Psion cantrips. The casting paths were missing this modifier
and ignored the catalog character-level scaling tables. A shared pure helper
now scales from actual total class levels, requires explicit Psion ownership
for the bonus and requests review for legacy unknown sources. It does not
guess conditional d8/d12 choices. Mind Sliver lacked a separate base-damage
field; its scaling table now also supplies the damage dice.

The Spells tab now exposes the same cantrip cast/roll/target controls as Actions.
Manual damage uses the canonical dice module, retains flat modifiers and mixed
dice in animations/history, and writes the actual character ID to action history.
Eight combined desktop/mobile local browser cases pass. The new pair verifies
2d6+4, persisted rolls/totals,
level-11 scaling, foreign ownership exclusion and the source-review note.
Screenshots inspected. Four component regressions verify combat damage payloads
and no damage on successful cantrip saves in both sheet tabs. Full gate passes:
1,721 unit tests, TS 208/208, entry 254 KB. The shared layout probe finds no
horizontal page overflow or off-screen controls; existing sidebar/header and
movement-button clipping remain outside this change. The spell-row chevron
has a minimum width so its glyph is not clipped on phones.

True Strike weapon selection/damage and Toll the Dead conditional damage remain
separate follow-ups. The base table is not treated as a full True Strike weapon
attack. Remaining casting audit: primary-class casting-stat selection for
multiclass spells, legacy cast/heal log identity, and leveled save-outcome rules.
PR #118 merged as `c9fea3aa`; main CI 37681526934 passed and public service
worker confirms 2.789.0.


### Released — spell grant level validation, v2.788

Automatic grants ignore orphaned secondary levels and invalid fractional,
negative, missing or non-finite secondary levels. Species unlocks now use the
same validated class levels as class grants. Nine regression cases cover the
stale-data failure; full gate passes (1,695 unit tests, TS 208/208, entry 253 KB).
No schema changes. PR #117 merged as `f5d90691`; main CI 37677762394 passed
and the public service worker confirms 2.788.0.

### Released — Psion spell replacements, v2.787

Production confirmed: PR #116 merged as `2e278076`; main CI 37675972052
passed and public service worker reports 2.787.0. Schema PR #115 applied all
four migrations in production (run 37674807253). Final verification: 1,686
unit tests, 36 desktop/mobile browser cases, TS 208/208, entry 253 KB.
The notes below record the implementation sequence; earlier local-only migration
and verification counts are superseded by this released status.

UA Psion Update p.3 (local supplied PDF) allows one cantrip and one prepared
spell replacement when gaining a Psion level. Current Spell Book removal/addition
bypasses that timing, and neither level-up flow offers the replacements.
The shared pure validator now checks one optional swap per category, class-list
eligibility, the new Psion-level spell ceiling, duplicate ownership, and protected
grants. It preserves unrelated choices and prepares the replacement leveled spell.
Its 42-test module passes (16 new replacement cases plus existing level checks).
Both level-up flows now share the replacement selector and commit validated
choices with the level increase. Ordinary picker removal is disabled for Psions;
missing selections can still be filled, and Advanced Spell Edits remains an
explicit manual-correction escape hatch. New subclass grant merging preserves
the selected replacement rather than rebuilding from the old known list.
Browser testing exposed an existing popup placement failure on phones: the Add
button could open below the viewport. A tested placement helper now keeps the
whole scrollable picker inside the screen. Desktop/mobile screenshots checked.
All 12 replacement/picker/discipline level-up browser cases passed together. Full
gate: 1,575 unit tests, TS 208/208, all required checks and 253 KB entry budget pass.

New-subclass acquisition, cancel/reopen and target switching now pass real
browser checks: grants survive a replacement, canceled choices stay unsaved,
and switching from Psion to Fighter discards the pending spell swap. All 10
spell-replacement browser cases pass together on desktop/mobile. A shared
context builder protects species grants at total character level and both
classes' automatic grants without projecting away the other class. Three
context regressions plus the full gate pass (1,578 unit tests; TS 208/208).

Local migration 20261007190000 adds spell_sources (spell ID → source tags),
leaving legacy ownership unknown. The level-up review now records explicit
class/feat/species/other sources rather than guessing from class-list tags.
Replacement removes only the Psion source: another class/feature keeps its copy;
a spell already known through Wizard can acquire a Psion source without a
duplicate known entry. Unreviewed outgoing spells cannot be replaced. Fourteen
new domain tests cover ownership; all 12 browser cases pass, including shared
Wizard/Psion persistence through reload. Four updated layout/shared-spell checks
also pass with valid Wizard level 3 eligibility. Mobile source controls inspected.
Full gate passes: 1,592 unit tests, TS 208/208, entry 253 KB. Migration is local only.

Local migration 20261007190500 validates source maps at the database boundary;
the domain validator matches its accepted source tags and the level-up UI blocks
unreadable source data without rewriting it. Eighteen shape tests pass. Realtime
now accepts known/prepared lists and source metadata together; a mounted level-up
view discards stale choices when another update changes their sources. Four real
DB/browser checks pass across desktop/mobile: malformed writes leave the prior
map untouched, and an open sheet observes the new lists and Wizard ownership.
Full gate: 1,611 unit tests, TS 208/208, all required checks and 253 KB entry pass.
Both spell-source migrations remain local only.

Explicit ownership now drives class spell counts and the ordinary learning
picker. Spells owned only by another class/feature no longer consume Psion
choices; shared spells count once. Unknown legacy entries retain conservative
counts without acquiring invented sources. Normal learning adds the chosen
class source, deduplicates the shared list and prepares learned Psion leveled
spells. Advanced removal drops only the selected class's source and preserves
independent copies. Unit regressions and desktop/mobile Add/Remove/count checks
pass; full gate passes with 1,622 unit tests, TS 208/208 and 253 KB entry.

Character creation now respects custom Psion spell selections and Blank Slate:
the four starter spells are suggested only for an empty recommended build.
Automatic Mage Hand does not suppress the default suggestions or consume a
chosen cantrip. New choices record their class source without inferring legacy
ownership. Six helper cases and two real-wizard submission cases pass, including
custom recommended and blank payloads; all 1,630 unit tests pass.

Preparation domain foundation: a separate per-spell source list distinguishes
reviewed unprepared copies (an explicit empty list) from unknown legacy readiness
(a missing entry). Preparing/removing one source preserves independently prepared
copies and refuses ambiguous legacy edits pending an explicit review. Twelve
regressions cover the Psion→Wizard readiness leak, independent copies, malformed
metadata, immutable input and review. This domain module is not yet connected
to saved character data or UI; database shape, creation/learning/replacement
integration, counts, review controls and real browser checks remain required.

Local migration 20261007191000 now persists spell_preparation_sources using
the same validated tag shape as learned sources; existing records retain {}.
New-character payloads record explicit prepared/unprepared class copies, and
realtime sync includes the field. A real local database round trip preserves
both nonempty and empty source arrays; a malformed update is rejected without
changing the saved map. Both desktop/mobile database checks pass. The migration
is applied only to Docker, and its ledger entry is verified. Ordinary learning,
level-up replacement and source-review controls still need this field wired in.

Ordinary learning/removal now uses one pure proposed change for learned sources
and preparation sources. A rejected readiness change cannot partially save a new
ownership claim. Seven additional unit cases cover shared copies, final removal,
feature copies, malformed metadata and ambiguous legacy readiness. The actual
picker is tested against both initially prepared and initially unprepared Wizard
copies; adding then removing Psion restores the original readiness and ownership.
Remaining integration: ordinary preparation toggles and per-class counts, level-up
replacement, explicit readiness review and automatic grants. Until these paths
are connected, the local release remains held.

Both level-up paths now apply source-specific preparation when swapping spells.
Shared legacy readiness blocks confirmation until explicitly reviewed; the UI
lets the player identify prepared sources or mark all copies unprepared. A source
ownership edit invalidates that spell's prior readiness review. Draft readiness
resets with remote spell-list changes and target switches. Replacement preserves
prepared Wizard copies and does not prepare a Wizard copy that was learned only.
All ten focused desktop/mobile checks pass (both flows, subclass grants, cancel,
class switching, shared-spell review/persistence); desktop/mobile layouts inspected.
Full gate passes with 1,652 unit tests, TS 208/208 and 253 KB entry.
Still local: ordinary preparation toggles/counts and automatic-grant source
tracking must be integrated before the schema-first production release.

Class preparation counts and ordinary toggles now read per-source readiness.
A Wizard-prepared shared spell does not fill the Psion prepared counter, and
preparing/unpreparing Psion keeps Wizard's copy ready. The card remains available
when another source is prepared; its toggle title names the edited class.
Both desktop/mobile toggle-and-reload regressions pass after correcting a test
locator that mistook the sheet's counted level tab for the picker tab.

New release prerequisite exposed by wiring the controls: legacy spells with
unknown learned ownership need a source/readiness review on the ordinary spell
sheet, not only in level-up. The older psion-spell-choices browser test must use
that review path for legal Charm Person while still proving illegal imported
choices are rejected; its old toggle titles also need updating. Do not deploy
until this path, automatic grants and a combined browser run pass.

The ordinary spell sheet now has explicit source/readiness review for existing
non-granted spells. A review cannot add a spell, remove automatic grants, claim an
absent character class, prepare a cantrip, or bypass Psion level/list/prepared
limits. Saving records the reviewed copies together; canceled drafts do not save.
Six adapter regressions and the full gate pass (1,662 tests, TS 208/208, 253 KB).
Eight desktop/mobile checks pass across legacy legal/illegal preparation,
per-class counters/toggles and shared-spell learning/removal. The prior legal
Charm Person test now reviews its legacy source before preparing it.

Additional follow-up noticed during fixture verification: a Psion with an empty
slot map is rendered as a noncaster. The new cancellation fixture initially
omitted its level-one slots; fix the broader classification separately so damaged
or imported slot data cannot hide spell recovery controls.

Automatic-grant foundation now distinguishes grant:class:<name> and grant:species
from deliberately learned class/species copies. Pure reconciliation removes only
expired tracked grants, preserves independent ownership/readiness, and never
reclassifies unknown legacy membership as grant-only. It separately expires
known granted readiness even when learned ownership remains unknown. Nine
regressions cover these cases plus malformed maps; tag-shape coverage is extended.
Local migration 20261007191500 updates the shared validator used by both source
columns. Docker apply, ledger and valid/invalid tag probes pass. This reconciliation
is not yet connected to the automatic-grant effect: replace the old ID-based
pruning there, derive both classes and species at total level, and correct initial
Mage Hand tagging before release. Unknown old grants must remain reviewable rather
than being silently deleted from a list that lacks provenance.

The sheet and both level-up flows now use one automatic-grant adapter, replacing
ID-based pruning in the root component. It derives grants for each class at its
own level and species at total level, tracks grants on the same level-up save,
and emits no patch when already reconciled. Creator Mage Hand is tagged as an
automatic Psion grant rather than a chosen spell. Four adapter tests and the full
gate pass (1,676 tests, TS 208/208, 253 KB entry). Combined browser verification
is in progress; its cancellation test's empty-map expectation must be updated
because automatic Mage Hand now correctly has a saved grant tag. A new real
species-expiry test checks independent Psion ownership and Paladin grants.

Combined run evidence: 31 browser cases passed; three failed (the cancellation
assertion on both viewports and a real mobile draft-reset race). Cancellation now
checks that Charm Person's sources remain unsaved, allowing the unrelated Mage
Hand grant tag. A canonical spell-state key now ignores list/key/source ordering
and duplicate values when deciding whether saved state changed; JSONB ordering
or cloned arrays no longer clear a level-up draft. A real-hook test proves an
equivalent echo preserves choices while a changed known list resets them.
All six focused follow-up browser checks pass: cancellation, shared-spell level-up
and species-grant expiry on desktop/mobile. Grant expiry keeps a separately
learned Psion Darkness copy unprepared and preserves Paladin Divine Smite.
Full gate passes again. A final combined green run is still required before release.

Release verification: source tracking is connected to creation, ordinary
learning/removal/preparation, both level-up flows and automatic grants. Explicit
review handles legacy records without inferred ownership. Spell management now
remains available for casters with missing slot records, including secondary
classes and unlocked casting subclasses; no slot values are invented. Seven
workspace checks and the full gate pass (1,686 tests; TS 208/208; 253 KB entry).
All 36 combined desktop/mobile browser checks passed together. Schema PR #115 merged at 6d954dc after all hosted checks passed. Production
migration run 37674807253 succeeded, and its actual apply log confirms all four
source migrations applied. The app branch includes that merge with no code
difference from the locally verified release candidate. Next: app PR, main CI
and public service-worker verification; the v2.787 frontend is not yet deployed.

### Released — Campaign concentration persistence, v2.786

Confirmed: pending saves read `state=offered`, roll and clear concentration,
then update the prompt. Two clients can both resolve the same offer; timeout
callbacks repeat every 250 ms without a claim. Old offers can also clear a new
casting. Next work must atomically remember one result and bind the offer to a
casting identity, including a fresh cast of the same spell. Cleanup must follow
confirmed persistence and stay recoverable after interrupted responses.

First local correction: a rejected character write now stops before dependent
conditions/buffs are removed or a concentration-broken event is emitted. Successful
clears also reset concentration_slot_level, whose existing database column is now
represented in the character types. Regression plus full gate pass: 1,538 unit
tests, TS 208/208, all build/rules/coordinates/anchors/hooks/budget checks.
Local casting-identity foundation: migration 20261007153000 adds a revision
that advances on every explicit spell write, including same-spell recasts, but
not on HP edits or duration ticks. Ordinary direct/RPC edits cannot spoof the
revision. Existing pending prompts retain a NULL revision because their original
casting cannot be reconstructed safely. Four real Docker tests pass, including
concurrent casts and transaction rollback. Production application is recorded below.
Local migration 20261007154500 adds `settle_pending_concentration_save`: the
owner/DM-authorized character and prompt locks record one outcome, clear the
original spell and slot metadata, remove only that caster's effects (including
condition cascades), and write history in one transaction. Replays return the
saved roll; stale/legacy offers retire without touching current effects. Ten
real database scenarios cover racing owner/DM clients, multiple offers, same-spell
recasts, unrelated effects, natural-extreme preferences, authorization and full
rollback when history fails. Production application is recorded below.
The local API recovery layer saves a proposed d20 before network I/O, reuses
it across failures/reloads, shares in-flight requests within a tab and accepts
another client's authoritative receipt. Sixteen isolated API tests cover offer
creation, lost responses, malformed receipts/storage, denied access and storage
failure. Prompt and automatic campaign paths now create revision-bound offers
and call the same transaction; the former client-side resolver/cleanup was removed.
Path tests verify prompt/auto/off and failed offer creation.

The modal retains uncertain rolls, stops repeated timeout submissions and offers
manual confirmation after reload. Recovery is above the character header so fixed
combat/mobile navigation cannot cover its button. Six desktop/mobile browser
scenarios pass, covering normal resolution, response loss with a later casting,
and failed timeout/reload. Mobile screenshots and overflow were checked. Spell
IDs are displayed as human-readable names.

The real applyDamage pipeline now has a desktop/mobile integration test with an
explicit character-linked combatant and HP assertions. It found a duplicate save
at encounter end: combat HP is copied to characters only then, and the sheet
mistook that transfer for new damage. Local migration 20261007160000 adds an
atomic carry-over identity; the sheet ignores only updates with a new identity.
The regression failed before the fix and now passes, including visible HP
carry-over and a later genuine hit that must still prompt. This exercises the
actual exported damage/endEncounter pipeline, not pointer-driven map attacks.
All 48 concentration browser/database checks pass together (desktop/mobile).
Full gate: 1,555 unit tests, TS 208/208, build/rules/coordinates/anchors/hooks
and bundle budget green (253 KB entry).

Active save bonuses,
advantage/exhaustion parity, summon/aura cleanup and other effects still need
audit. During-combat sheet HP still uses the character snapshot; map HP uses the
combatant. A unified live HP model is separate follow-up work. Offer creation and
parent damage application are not yet durable/idempotent like save settlement.
All three migrations shipped through schema PR #113 (merge 48b5fd5). Production
workflow 37652706065 succeeded; its apply log confirms each migration applied.
Frontend PR #114 merged at 461e5be after all checks passed. Main CI
37654111665 passed; the public service worker confirms v2.786.0.

PR #112 (sheet concentration, v2.785) merged at 89350c6 after all PR checks passed.
Production CI 37644873225 passed; the public service worker confirms v2.785.0.

### In progress — Character-sheet concentration correctness, v2.785

The standalone sheet now reads the same effective Constitution/save proficiency
as its ability tiles, uses the canonical dice/save helpers, and records saves
under the character ID (previously the account ID, losing character history).
Eight local desktop/mobile scenarios verify bonuses, standard natural extremes,
the explicit natural-20 house rule, failed-save cleanup and persisted history.
Failed saves now clear concentration immediately, before the dice animation.
Only the notification is deferred, so later castings (including the same spell)
survive old animation callbacks. Resolution and cleanup read the current sheet
snapshot rather than a stale realtime-subscription closure. Four desktop/mobile
frozen-clock scenarios pass twice each; the old implementation fails the same
regression. This remains local follow-up work pending release.

Remaining concentration audit: campaign save prompts use a separate resolver;
active save bonuses,
advantage and exhaustion need consistent handling across both paths. Do not
claim concentration automation complete until these paths are reconciled.

Release status: database PR #110 merged at 60499b3. Migration run 37642330605
attempt 2 actually applied 20261007133000 to PROD after a GitHub runner outage.
Client PR #111 merged at 2bf23f1; main CI 37642913067 and Vercel are green.
The public service worker reports v2.784.0. Concentration follow-up remains local.

### 2026-10-07 — Energy Dice persistence, v2.784

A real two-tab browser regression reproduces the remaining base-pool race:
two paid manual rolls from six dice leave five instead of four. The new local
`settle_psionic_energy` transaction serializes costs and Psionic Restoration,
records immutable request payloads and recovery history, preserves sibling
resources, and returns ordered receipts. Fifteen real database scenarios cover
concurrent requests, last-die contention, rollback, authorization, Restoration,
malformed values and all 20 level boundaries. API/reconciliation tests pass.

Merged in PR #111. Manual rolls, Biofeedback, Destructive Thoughts,
conditional bonus costs, Propel/Connection settlement and Restoration (Actions and Features) now use the saved
payment path. The original two-tab manual-roll regression passes on desktop and
mobile, as does lost base-payment recovery across reload without a second cost or
automatic effect. Receipt acknowledgement is local only and rejects older revisions.

Connection claims its first free extension atomically; competing free requests
reject rather than becoming silently paid. The protected ordinary-sheet-patch RPC
now backs ordinary character saves. Ordered acknowledgements repair stale tabs,
and pending whole-map edits preserve transaction-owned resource keys. A real
delayed Settings save racing another tab's die spend keeps both the database and
displayed balance correct on desktop/mobile. Existing failed-save navigation and
retry tests also pass through the protected endpoint. Movement-trait auto-resets
use it too, preventing stale daily-feature counters from being replayed.

SRD 5.2.1 p.185 exposed a separate 2014-rule remnant: Long Rest recovered only
half-level Hit Point Dice. The local sheet and DM party-rest path now restore all spent dice and log
the actual amount; desktop/mobile sheet rest tests verify zero dice remain spent.

Manual pool edits, explicit subclass costs, paid teleportation refresh, free-use
casting and manual tracker corrections now use transactions. Desktop/mobile tests
verify their persisted balances without whole-resource writes. Competing manual
corrections and paid refreshes have one winner and stable retries.

The local `complete_psionic_rest` foundation saves a complete captured rest patch
under the same character lock. It rejects changed snapshots, repairs malformed
pools on Long Rest, preserves daily features on Short Rest, restores all Hit
Point Dice on Long Rest, and replays without repeating recovery. Four new real
database scenarios verify rest contention, replay, daily limits and full rollback.
Player Short/Long Rest controls now use this transaction. Captured snapshots and
item recharge outcomes are retained in browser recovery before sending. Lost
responses can be confirmed after reload without restoring later-spent dice or
item charges; all four desktop/mobile interruption cases pass. Six normal rest,
Restoration-refresh and malformed-pool browser cases pass too. Delayed rest
acknowledgements preserve newer local/remote HP, exhaustion and sibling resources.
DM party rests now use the same captured transaction for Psions. Each saved rest
has a named recovery notice in the Party tab, surviving reload. Partial failures
are reported without claiming the whole party rested; known failures can retry
only their characters. Already-rested characters remain untouched. Six real
mixed-class party scenarios pass across desktop/mobile, including a DM updating
another account's character, lost responses, reload and targeted rejected retries.
Party-rest text now accurately describes all Hit Point Dice and one exhaustion
level. The TypeScript baseline fell from 210 to 208.

Level-up paths retain their existing available dice while updating choices and
capacity; a Long Rest restores the new maximum. A database regression checks
that leveling and movement-trait recovery do not refresh paid Psion resources.
Validation: all 134 selected Psion browser/database checks now pass across
desktop/mobile (130 in the broad run, four legacy discipline checks rerun after
replacing their capped shared-account fixture with disposable accounts).
The full gate passes with 1,537 unit tests, TypeScript 208/208 and a 253 KB entry.
Database endpoints and frontend v2.784 are verified live.
Audit subclass spell-slot payments separately; do not invent an unsupported
PED-to-slot feature. Ordinary saves now preserve transaction-owned keys;
conditional spending, the free Connection extension and unrelated edits are tested.
Shared Discipline turn claims remain separate unfinished work.

### 2026-10-07 — Cancel interrupted group drags, v2.783

Losing pointer capture or hiding a tab now cancels group movement previews,
restores token positions for peers and releases drag locks. A later pointer-up
cannot save the abandoned move. Normal drops, other pointers, undo/redo and
reconnected peers retain their existing behavior. Unit regressions reproduce
the old failures; desktop/mobile tests revoke real browser capture and verify
both accounts recover without a database write.

### 2026-10-07 — Persisted Enkindled and Surge costs, v2.782

Enkindled now records its once-per-turn use, extra rolls, Hit Point Dice cost and
recovery history in one transaction. Surge uses the same locked character row,
so competing enhancements cannot overwrite each other's costs or spend the last
Hit Point Die twice. Owner/DM authorization and immutable request IDs protect
shared use and retries. Each combat advance gets a fresh turn token, including
rewinds; independent level-20 Psions advance a saved tabletop turn with End Turn.

The sheet accepts ordered server receipts without writing them back as optimistic
absolute values. Newer costs and rest recovery survive delayed responses. Pending
character edits must save first. Uncertain requests retain their original rolls
and identifiers in browser storage; the Actions recovery notice confirms the
same cost and shows the complete rolls for manual resolution. It deliberately
does not replay a parent heal/damage effect that may already have resolved in
another tab. Definite rejection does not discard the original-roll information.

Enkindled's turn limit is enforced; other Discipline turn claims remain manual.
Base Psionic Energy Die deductions still use optimistic character saves and can
conflict across simultaneous tabs. Those costs and shared Discipline claims are
the next persistence work. Combat advancement itself remains multi-write.

Validation includes real local transactions for authorization, malformed rolls,
replays, competing tabs, last-die contention, history rollback and turn rewinds;
desktop/mobile reload, shared-limit and complete roll-flow checks; plus the full
project gate. The production migration applied successfully through CI after PR #108.
Frontend v2.782 was verified live; v2.783 map cancellation is also live after PR #109.


### 2026-10-07 — Preserve sheet turn budgets on failed advance, v2.781

End Turn now waits for a successful combat advance before resetting local action,
bonus action, reaction and movement trackers. Returned failures and rejected
requests retain those trackers and show a persistent warning to check combat
before retrying. Repeated clicks are blocked while pending, and a late result
cannot reset a different or closed character sheet. Independent tabletop resets
remain available outside the character's active combat turn.

This fixes the sheet's response handling; the existing multi-write combat
advance itself is not transactional. Shared Psion turn claims remain unfinished.


### 2026-10-07 — Enkindled Life Force roll integration, v2.780

Level-20 primary Psions can add one or two Energy Dice to their roll by spending
that many Hit Point Dice. Extra Energy Dice do not reduce the pool. This now
flows through Biofeedback, Destructive Thoughts, conditional check/attack bonuses,
Telekinetic Propel, Telepathic Connection and manual Energy Die rolls. Surge is
offered after extra dice, improving all low dice for one additional Hit Point Die
when available. The free Psykinetic d4 is excluded. Larger totals retain original
dice metadata through settlement instead of being rejected as impossible d12s.

A shared optimistic character reference prevents an unchanged prop on a modal
rerender from refunding an already-paid cost. Fresh character snapshots still
replace it. The manual roller owns its resource deduction, and generic ambient
pool rows no longer fall through to a Psionic Energy Die deduction. Removing
that obsolete path lowers the TypeScript baseline from 211 to 210.

Enkindled's once-per-turn use is explicitly confirmed by the player; automatic
shared turn claims remain unfinished. This adds the capstone to existing roll
flows, not the missing effects of other disciplines or subclasses. Character
resource persistence remains optimistic rather than transactional.


### 2026-10-07 — Biofeedback history and paid-roll recovery, v2.779

Biofeedback releases its control after applying temporary HP without waiting for
history delivery. Rejected or error-result history writes show a warning while
preserving the paid effect. If its sheet closes during the Surge decision, the
original paid roll is logged with instructions to apply temporary HP manually
without spending again; it never writes HP onto another character's sheet.
This recovery depends on the app remaining open long enough to deliver history.
Focused regressions failed against the previous behavior, and local browser
checks hold the actual history request while verifying HP and the usable control.


### 2026-10-07 — Keep ruler labels inside the canvas, v2.778

Ruler labels move above the endpoint near the bottom and shift inward at the
left/right edges. Camera panning and resize now refresh placement as well as
zoom. The measured path and distance stay unchanged. Pure placement checks and
actual Pixi desktop/mobile corner tests cover this; the new browser regression
fails against the previous unclamped label placement.


### 2026-10-07 — Destructive Thoughts damage automation, v2.777

The selected Discipline now offers a target and Energy Die count, spends that
count once, rolls the canonical die size, adds effective Intelligence once and
supports Surge across every low die for one Hit Point Die. Confirm the qualifying
Psion Conjuration/Evocation spell and visible creature yourself; damage is
independent of that spell's save. The existing one-Discipline-per-turn reminder
remains manual, and this action does not cast or spend the triggering spell.

In an active encounter, a fixed paid total enters normal combat damage resolution.
A retained result and stable declaration ID allow retry after an ambiguous write
without another charge or duplicate damage. Hidden participants remain filtered
by database policy. Outside an encounter, a named-target result is logged for
manual tabletop application. Character resource persistence is still optimistic,
not transactional with the combat queue; the result display is session-local.

Local desktop/mobile checks cover tabletop use, a real player with hidden enemy
rows, a deliberately lost insert response, retry, and a separate DM applying
12 Psychic damage (30 HP to 18) with exactly two Energy Dice and one Hit Point
Die spent. Focused tests cover resource changes, sheet closure and slow logging.


### 2026-10-07 — Ruler readability across zoom, v2.776

Ruler labels keep a 14-pixel screen size with capped high-density text rendering.
Measurement strokes and point markers also retain their screen weight while
zooming; the label sits a consistent distance below the tip. Toolbar and gesture
zoom redraw through the viewport frame event without rebuilding the layer.
Moving onto toolbar controls or outside the canvas clears only the live preview,
retaining committed waypoints and distance instead of measuring to the controls.
World-space points and the summed grid distance are unchanged. Rendered-canvas
checks cover 25%, 100%, 400%, repeated zoom and tool teardown on desktop/mobile.

### 2026-10-07 — Multiclass proficiency and casting consistency, v2.775

Shared character statistics now derive proficiency from total character level,
as required by SRD 5.2.1 p.25. Sheet skills/saves/DCs, ability checks, feature
calculations, party passive Perception, roll requests, weapon mastery DCs,
combat target saves, concentration saves and reaction DCs use the same helper.
Narrow database reads now include secondary-class progression. The level-up
preview keeps its already-correct total-level behavior through the shared rule.
Spell casting also uses effective item-adjusted ability scores, matching the
sheet header instead of reverting to the base Intelligence score.

This does not fix multiclass spell-slot aggregation or every secondary-class
feature. Older subclass description formulas in classes.ts remain a separate
source audit (some combine proficiency with outdated feature rules).

### 2026-10-07 — Psion spell-choice eligibility, v2.774

Adding/preparing Psion spells now checks the Psion class level independently of
edited or multiclass slot totals. Preparing also requires the base class list
and an existing selected spell. Always-prepared subclass grants retain their
exemption and do not consume the normal cap; the free Mage Hand does not consume
a chosen cantrip slot. All twenty maximum spell levels are source-checked.

This closes selection validation gaps, not the remaining once-per-level spell
replacement workflow. Existing imported spells are retained for review; other
classes' preparation behavior is unchanged.

### 2026-10-07 — Resolve Surge independently of history delivery, v2.773

A confirmed Psionic Surge now returns its improved dice immediately after paying
the Hit Point Die. Previously a slow action-log request held the result, and
closing the ability while waiting could discard it after payment. History is
sent independently; a rejected write reports that Surge applied but its log
could not be saved. Focused tests hold or reject logging and verify the paid
result still resolves. Desktop/mobile Biofeedback checks also hold the actual
history request and verify temporary HP is saved before releasing it. This does
not make character persistence transactional.

### 2026-10-07 — Background image lifecycle, v2.772

Closing a map invalidates pending image loads and their retries, releasing stale
textures instead of mounting an orphan sprite. Replacing the viewport transfers
an already-loaded background and updates its size. Requests for the same image
retain the shared texture while a newer request is pending. Six focused tests
cover cleanup, viewport replacement, resize races and delayed retries; restoring
the previous implementation fails these regressions.

### 2026-10-07 — Preserve the page on first worker installation, v2.771

The initial service-worker claim no longer reloads an already-current page.
Previously first-time visitors could lose an open dialog when installation
finished a few seconds later. Replacing an existing controller still reloads
once to pick up a deployment; duplicate events remain guarded.

Desktop/mobile fresh-browser checks verify installation/control without another
document navigation. The actual inline registration script is also exercised
against first-claim, existing-controller, and repeated-change sequences. Restoring
the old first-claim reload fails the fresh-browser regression.


### 2026-10-07 — Biofeedback dice and temporary HP, v2.770

Biofeedback now has a usable Actions button. After confirming the qualifying
Psion Necromancy/Transmutation spell trigger, choose dice up to effective INT
modifier and current availability. The chosen cost is paid before the result;
add INT once and keep higher existing temporary HP. Cancelling the count prompt
costs nothing. Psionic Surge can improve every low roll for one Hit Point Die,
including when Biofeedback just spent the last Energy Dice. Original rolls and
costs are logged, and unrelated resources are retained.

This is manual trigger confirmation: it does not cast a spell or enforce the
once-per-turn Discipline limit across every character/campaign action. The
prompt states those requirements. If Surge becomes unavailable after payment,
the original Biofeedback result still applies. Desktop/mobile checks cover
persistence, non-stacking, cancellation, last-die Surge and existing powers.


### 2026-10-07 — Unlock Psion spell slots on level-up, v2.769

The banner level-up wizard now updates a single-class Psion's slot capacities
from the class table. Previously it saved the new level and HP but retained old
slots, hiding new spell levels from the picker. Existing expenditure is retained;
new tiers start unused. The existing Settings level-up flow shares the pure
capacity merge instead of maintaining a second implementation. No rest is granted.

All 20 Psion slot rows are checked against the owner's Update PDF p.2. Unit checks
cover new tiers and preserving expenditure; desktop/mobile local flows cover
1→2, 4→5 and 5→6 with already-spent slots. Multiclass slot aggregation and other
classes' banner-wizard progression remain separate audit work.


### 2026-10-07 — Discipline replacement at Psion level-up, v2.768

Every Psion level from 2 onward offers a Discipline review, including levels
without an additional choice. Players can keep their choices or replace one
existing Discipline, as specified on page 3 of the owner's Update PDF. Initial
choices and increases at 5/10/13/17 use the same pure count/selection rules.
The wizard validates exact totals and at most one replacement before proceeding
and saving; legacy display names resolve to unique IDs. Confirmation lists the
final choices, and changing the target class resets draft choices. Other class
levels do not offer or save a Psion replacement. The wizard now uses the shared
body portal so animated sheet containers cannot clip its header or footer.
No database migration.

Validation covers all 20 counts and invalid inputs, plus desktop/mobile local
level-ups 1→2, 4→5 and 5→6, rejecting a second replacement and retaining other
resources. This does not yet automate the separate spell/cantrip replacement.


### 2026-10-07 — Psion casting-stat header, v2.767

The Spells tab now displays Psion's casting modifier, spell attack and save DC.
The header uses the same calculated values as spell actions, so an equipped and
attuned Headband of Intellect also appears correctly. Removes a duplicated
class/ability map that excluded Psion and ignored effective ability scores;
stat captions are larger and use the normal secondary-text color. Desktop/mobile
local checks cover level/Intelligence scaling and the attuned-item override.


### 2026-10-07 — Clear grid at every zoom, v2.766

Map grid strokes now retain their screen thickness as the artwork zooms. Both
toolbar and gesture zooms refresh the existing layer without moving it above
tokens; ordinary panning does not rebuild the grid. Desktop/mobile canvas-pixel
checks cover 50%, 100% and 400% zoom at the renderer's display density.


### 2026-10-07 — Psionic Surge on base powers, v2.765

Powered Telekinetic Propel and Telepathic Connection now offer Surge after a low
Energy Die roll at Psion 7+. They share the existing conditional Discipline
confirmation/cost flow through one helper. The Hit Point Die is spent immediately;
passing the later STR save or cancelling target resolution does not refund it.
Propel still spends its Energy Die only on a failed save, and Connection retains
its first-free extension. Original rolls remain in history, with the adjusted
result and distance explained. Resolution deduplication is per power use: a slow
history insert no longer silently discards the next independent power. Character
live updates now compare against a synchronously advanced snapshot and preserve
queued local fields, preventing rapid echoes from leaving the sheet on stale
resource values even when the database saved correctly. Free Psykinetic d4 and fixed 5-ft Propel do not
qualify as Energy Die rolls. No automatic map movement is introduced.

Validation: unit coverage for cost separation, declining Surge, concurrent pool
changes and free-d4 exclusion; desktop/mobile local checks for save success,
first-free/paid Connection, cancellation, reload and the level-six Telepath base
range. Existing conditional Discipline/Surge regression remains covered. The
TypeScript baseline drops from 212 to 211; 1,239 unit tests pass.


### 2026-10-07 — Consistent Psion resource validation, v2.764

Restoration, base powers, direct spending and conditional Discipline bonuses share a pool
validator. Missing legacy values still initialize to the class-table maximum;
explicit null, fractional, negative, non-finite or overfull values cannot be spent
or silently rewritten by those actions. Invalid class levels cannot unlock them.
Restoration displays a resource-check message. A normal Long Rest restores a valid
pool through the existing recovery path. The direct Spend Die button also refuses
an empty pool instead of rolling for free. PED-cost and feature-refresh handlers
use the same validation; manual pool editing remains available. Spend logs now
report the actual remaining pool instead of always reporting maximum minus one.

Validation includes every one of the 20 Energy Dice table rows, invalid-state
boundaries, normal conditional costs, and desktop/mobile local-database checks
that preserve a malformed value until a deliberate Long Rest repairs it.


### 2026-10-07 — Recoverable map-image fitting, v2.763

Scene settings now shows when the map image is loading, blocks conflicting edits,
saves and deletion during fitting, and keeps Cancel available. Image failures
produce an accessible in-dialog error with retry/manual-entry guidance. Fitting
rejects dimensions beyond the existing 200-cell limit without replacing the draft;
raising the grid pixel size and retrying succeeds. Closing or changing scenes
invalidates delayed image results. No image resampling or token writes occur.

Validation: desktop/mobile browser tests intercept all backend traffic and cover
404/retry, oversized-image preservation, successful sizing, cancellation/reopen,
and existing save/delete/error/focus behavior. Full release gate and visual checks.


### 2026-10-07 — Correct character Attack action counts, v2.762

Encounter seeding read a nonexistent `class` field, so real characters started
with one attack. The weapon header also hardcoded one. Both now use a pure
class-level helper: Metamorph gets two at Psion 6; Barbarian, Monk, Paladin and
Ranger at 5; Fighter gets 2/3/4 at 5/11/20. Primary and secondary class levels
are evaluated separately and the highest benefit wins, never summed.

This corrects the sheet reference and newly seeded combat counters. Existing
encounters are not rewritten. Bonus/reaction attacks, temporary effects,
weapon-specific invocations, other subclass grants and Metamorph's cantrip
replacement remain separate work; this does not claim automated turn enforcement.

Validation: source audit against SRD 5.2.1 and private Psion update p.8, boundary
and multiclass unit tests, real seed-to-row counter checks, desktop/mobile
character-sheet regression and full release gate.


### 2026-10-07 — Restoration works from Features too, v2.761

The Features-tab button matched the generic non-save handler, which merely
flashed Used! because Restoration had no tracker configuration there. It neither
restored dice nor marked the real once-per-Long-Rest use. This entry point now
reuses the same meditation control and resource logic as Actions. Both show full
and used states, confirm the one-minute meditation, refill the pool and persist
the two existing use trackers. No second recovery implementation was introduced.

Validation: the real local resource/rest regression now runs from BOTH Actions
and Features on desktop and mobile, including reload, Short Rest remaining spent,
and Long Rest refresh. Full gate and screenshots/layout checks pass.


### 2026-10-07 — Revised Psion subclass reference audit, v2.760

Audited 18 feature entries for Metamorph, Psykinetic and Telepath against the
owner's UA update pp.7–10. Each now has a concise summary and expanded mechanics. Expanded detail text
uses the normal readable body size and contrast rather than muted metadata.
Restored costs, action timing, durations, visibility and target restrictions:
Flesh Weaver's separately paid healing; Rebounding Field's half damage on a
successful save and temporary HP equal to actual damage; Mind Infiltrator's
unchanged spell cost; Organic Weapon properties and riders; Mutable Form Touch
casting-time limit; armor restriction on Superior Stride; Incapacitated limit
on Bulwark Mind; optional no-Concentration Telekinesis and Gargantuan objects;
Confusion's automatic successful save rather than an invented blanket exemption.
Life-Bending Weapons retains the source's start-of-next-turn restriction without
introducing a new automated interpretation. Private UA/source gates stay intact.

Chained dialog reliability: the shared Modal now publishes its request immediately,
clears it before resolving, ignores clicks from replaced dialogs, and remounts
replacement prompts to reset their input/focus. This protects Surge's two-step
confirmation. Deterministic tests reproduce three failures in the old modal;
rapid replacement, early confirmation, stale clicks and unmount are covered.

This is reference accuracy, not automation of these effects. Psi Warper remains
unchanged pending the original v1 source. Validation: full gate, desktop/mobile
expanded Features checks for all three subclasses, screenshots and layout probe.


### 2026-10-07 — Psion spell-card casting reminders, v2.759

Mage Hand's spell-list badge incorrectly claimed compulsory invisibility after
the main feature text had been corrected. It now says Subtle, with the shared
full rule: no Somatic components and optional invisibility when casting.
Expanded Actions and Spells cards share Psionic Spellcasting reminders for base
Psion and class-granted spells, retaining normal spell components alongside the
exception. Consumed materials and any specified cost remain required; Somatic
components still apply when listed, except Subtle Telekinesis. Other classes do
not receive these reminders. This changes references, not the casting pipeline.

Validation: full gate, desktop/mobile Actions and Spells rendering, Identify's
100 gp pearl retained, Wizard exclusion, screenshots and shared overflow probe;
removing the shared reminder fails the browser check. No new clipping found.


### 2026-10-07 — Consistent default map geometry, v2.758

With no viewed map, attack geometry picked the most recently edited scene,
while the map and cold combat starter picked the oldest-created scene. Editing
another scene could therefore change calculated ranges without changing the
map that opens. Geometry now uses the same created-at order as the scene list;
both break timestamp ties by id. Explicit viewed scenes still win, scoped to
the requested campaign. No token coordinates, permissions or schema changed.

Validation: selection unit tests and local browser integration with two scenes
placing the same characters 5 ft versus 40 ft apart, including a newer edit,
stale viewed id and tied creation timestamps; full release gate.
Persisting an encounter-to-scene association for cross-client consistency is
still a separate queued improvement; this fixes the cold default mismatch.


### 2026-10-07 — Psionic Surge on conditional discipline rolls, v2.757

The owner's UA update p.4 permits one Hit Point Die after rolling Energy Dice,
treating 1–3 as 4. Inerrant Aim, Devilish Tongue, Expanded Awareness and Observant
Mind now offer this when eligible. The Hit Point Die is spent immediately on
acceptance, separately from the Energy Die's later changed-outcome decision.
Declining preserves the original roll. No healing or extra Energy Die charge.
Current class, selected discipline and resources are rechecked before spending;
logs retain the original roll and the adjusted bonus. All four controls remain
primary-Psion-only, matching their existing eligibility.

Validation: pure multi-die/boundary/cost tests, component cancellation and stale
resource cases, real desktop/mobile persistence checks, screenshots and layout
probe, plus the full gate. Other Psion roll paths still need Surge integration;
Enkindled Life Force and automatic discipline turn limits remain queued.


### 2026-10-07 — Conditional Psion discipline dice, v2.756

Inerrant Aim, Devilish Tongue, Expanded Awareness and Observant Mind now have
Roll bonus controls. Previously these free-action rows had no usable button;
the general pool button charged a die immediately. The new flow rolls without
charging, explains the discipline's trigger, then spends one die only when the
player confirms that the bonus changed the outcome (UA update pp.4–5).
Cancel/Keep die does not spend. Resolution checks current pool/character and
chosen discipline; malformed/depleted pools cannot roll. Other resources remain
intact. Canonical die sizes now serve the base powers and these controls.

The general Discipline reference now includes the once-per-turn restriction and
level-up replacement rule. This remains tabletop outcome confirmation: it does
not rewrite a previous attack/check or automatically enforce turn limits.
Those integrations and the other Discipline effects remain queued.

Validation: full gate, pure cost/die boundary tests, component stale-state and
cancel tests, desktop/mobile real resource checks, screenshots and shared
overflow probe. Removing the controls fails the browser regression.


### 2026-10-07 — Readable map party cards, v2.755

Reproduced the mobile party panel clipping: its fixed 240px reserve plus an
inline heading hid most of even the first character. The heading now stays
above a scrolling card row, leaving one complete card visible on phones.
HP bars, HP totals and AC have clearer contrast and consistent map styling.
Native buttons provide keyboard access to existing pan-to-character behavior;
collapse preference and noninteractive embedding remain supported.

Navigation measures the party panel and reacts to collapse, resize, delayed
loading and the initiative strip moving it. The panel reserves the dice-button
lane and stays above combat controls. No map/token position writes changed.
Validation: full gate (1125 tests, existing TS baseline 212), desktop/mobile
party and broader map regressions, screenshot review, shared overflow probe
(no new clipping), and old-component mutation failure.


### 2026-10-07 — Psionic Reserves initiative recovery, v2.754

Owner UA update p.4: eighteen Psion levels, initiative restores expended dice
TO four when fewer remain. Solo sheet rolls, campaign auto-rolls, late joins
that roll, and individual initiative rolls now recover automatically. Player
agency participants do not recover until they roll. Primary and secondary
Psion class levels qualify independently; total level does not qualify.

Migration `20261007070000_psionic_reserves.sql` adds an authenticated,
SECURITY INVOKER function that locks the character and changes only the PED
JSON key under existing owner/DM RLS. Full/missing/malformed pools are not
reduced or guessed. Repeated calls without spending do nothing. Success is
visible in the sheet or combat log; sync failures advise manual recovery
without losing an already-started encounter. No private-content gates change.

Validation: 1122 unit tests and full gate; six desktop/mobile local DB cases
cover solo and real campaign roll orchestration, level boundaries, secondary
class, unchanged other resources, repeated calls and unauthorized callers.
Screenshots and shared overflow probe pass for the notice; browser regression
fails with the solo hook removed. Migration applied and ledger verified locally;
production migration applied through CI (run 37583840172, confirmed apply log).

Next: map interaction and visual polish, then remaining Psion disciplines and
subclass automation/source audit. Original v1 Psi Warper source remains missing.


### 2026-10-07 — Psion sheet spell numbers, v2.753

The vitals strip now uses canonical computed spell attack/DC instead of a
second hardcoded caster list and base-score formula. Psion stats are visible
and equipment-adjusted ability scores are honored. Verified level 5 INT 18
(+7/DC15) and level 17 INT 20 (+11/DC19) on desktop and mobile; regression
fails without the fix. Shared overflow check found no spell-chip clipping
(existing breadcrumb truncation and movement +/- clipping remain).


### 2026-10-07 — Saving-throw accuracy, v2.752

Standard saves now compare total against DC, including natural 1/20, per
SRD 5.2.1 pp.6–7. Character natural-extreme house rules remain unchanged
and are honored by class abilities, pending saves, concentration, aura,
Topple and end-of-turn saves. Creature saves use standard rules.
Telekinetic Propel no longer spends a die because of an invented automatic
failure. Bonus overrides retain the target's preference; rolling waits for
bonus loading. Manual pass/fail remains available. Regression tests cover
Propel costs, conditions that force failure, concentration cleanup and failed
preference reads without touching a database.

Next: Psion spell-stat visibility, Psionic Reserves initiative recovery,
remaining source-backed ability audit, then map interaction/presentation.



### 2026-10-06 — Psion subclass action eligibility, v2.751

All six Psi Warper action rows now require Psi Warper and their existing
minimum level. Base Psion powers and disciplines remain available to the
other subclasses. The same eligibility rule guards use and resource restore.
Subtle Telekinesis now consistently states that Somatic components are waived
and invisibility is optional when casting, per the owner's UA update p.3.
Private access is unchanged. Original v1 PDF is not currently available in
the known Downloads location: other Psi Warper descriptions remain unaudited.
Next: original-source audit, Warp Propel teleport resolution/placement,
Psionic Reserves and remaining subclass automation.



### 2026-10-06 — Psion Propel reference correction, v2.750

Owner-supplied Warp Propel text fixes the destination origin (within 30 ft of
YOU, horizontal to you, visible and unoccupied), removes the invented prone
rider and unsupported Mass Teleportation cross-reference. Actions and subclass
Features now share one complete reference. Expanded Warp Propel includes the
full prerequisite Telekinetic Propel rule: target restrictions, STR save,
straight movement, optional die roll and expenditure only on a failed save.
Base Features and creation milestones share the same text; corrected their
old implication that base telepathy requires a Bonus Action.

This is a text correction, not automated teleport placement. Private Psion
access is unchanged; these owner-provided UA rules are not SRD-licensed.
Remaining: audit other independently abbreviated Psion descriptions against
v1 plus the v2 patch, and the previously queued subclass action visibility
and Warp Propel resolution/placement work.



### 2026-10-06 — Audited spell details, v2.749

Fifteen complete SRD 5.2.1 entries now override stale canonical database text
and the static fallback through `src/data/srdSpellDetails.ts`: Aid, Bless,
Counterspell, Dispel Magic, False Life, Guidance, Haste, Hold Person,
Invisibility, Jump, Mage Hand, Polymorph, Shield, Sleep, Suggestion.
Includes casting triggers, material costs, duration, all body paragraphs and
higher-level effects; each entry links its official PDF page and attribution.
Shared description renderer preserves paragraphs/scaling in browser, sheet,
preparation picker and cast dialogs. Owned/homebrew and gated-source records
are excluded from the canonical correction. No database writes or migration.

Corrected conflicting 2014 metadata: Sleep is a 60-foot-range, 5-foot-radius
Wisdom-save concentration spell, not a 5d8 HP pool; Jump is a Bonus Action;
False Life grants 2d4+4 temporary HP (+5 per additional slot); Counterspell
uses a Constitution save. This is reference/cast-metadata work, not full
end-to-end automation of every exception (Sleep's follow-up save, Polymorph,
Counterspell refunds and other table adjudication still need separate work).

Remaining: audit the other 320 of the 335 SRD-matched catalog entries,
including tables and summoned stat blocks, before giving them provenance.
The runtime correction does not update direct SQL/export consumers. Future
DB reconciliation must reuse these reviewed values, not bulk-copy the older
static table. Non-SRD content requires a separate rights/source review;
paraphrasing or restricting access is not itself a license.


**Established:** July 2026 (chat 15)
**Status:** Living document. Update as tracks progress.

### 2026-10-06 — Psion base power costs, v2.748

Telekinetic Propel now offers free 5 ft / powered die choices; both require
one target's STR save. The die is rolled before the save and spent only on
failure. Psykinetic level 3+ offers a free d4. Combat uses the existing save
resolver with a single-target selector; solo use records the tabletop save.
The dialog states the Large-or-smaller/30 ft/line-of-sight limits. Eligibility
is still checked at the table; movement is applied manually on the map.

Telepathic Connection now distinguishes always-on base telepathy from its
one-hour extension: first extension per Long Rest is free, later ones cost
one die. A die must remain available to roll. Range is calculated and logged,
including the Telepath level-6 base range; repeated extensions do not add
previous rolls. Short Rest preserves use count; Long Rest resets it.
No new database migration or expansion of private content access.

Source: owner's UA2025-Psion+Update.pdf pp.3, 9–10 under PSION_UA_SOURCES.md
policy. Remaining: active telepathy expiration display, subclass-only rows,
Psionic Reserves, discipline/surge automation and broader progression audit.

### 2026-10-06 — Psion automation: Psionic Restoration, v2.747

The level-5 feature existed in reference/resource data but was absent from
the live Actions catalog. Added a one-minute meditation completion action:
refill all Psionic Energy Dice and consume the once-per-Long-Rest use together.
Full pools, repeat use and cancellation do not spend a use. Existing short-rest
recovery remains +1 die; Long Rest resets both tracker representations.
No campaign is required. Uses the established v1-plus-v2 policy in
`PSION_UA_SOURCES.md`; does not broaden private Psion content access.

Next Psion action items, before claiming full automation:
- Audit Telekinetic Propel/Telepathic Connection against the update: explicit
  free versus powered choices, correct cost/save timing and measured effects.
- Gate Psi Warper action rows by subclass; the current base Psion Actions
  catalog includes them without a subclass filter.
- Wire level-18 Psionic Reserves into initiative; it currently appears in
  reference feature data, with no corresponding automation found.
- Audit each discipline's cost, success-only consumption/refund, and rest
  behavior; cover all four subclasses and secondary-class progression.
- Run a Psion character through creation, level-up, combat, persistence and
  both rests with database-backed regression coverage.

### 2026-09-22 — Tokens land where the preview shows; every token is a target, v2.746

Reproduced the "token shifts a little after I let go" report on the local stack
with two clients sampling positions every 40 ms. On the mover's own screen there
was no race: the ghost followed the raw cursor and only glided to the cell after
release. Other clients received raw cursor positions, then one jump to the cell at
release, and their drag lock cleared at pointer-up while the save was still in
flight, so a delayed or rejected save rewound the token seconds later. Now one pure
`snapTokenDrop` helper (`lib/map/coords.ts`) drives the preview, the ghost, the
broadcast, the commit and click-to-move; the ghost snaps cell to cell during the
drag (behind `SNAP_GHOST_WHILE_DRAGGING` in TokenLayer, one line to revert); the
drop commits the previewed cell; peers only ever see snapped cells; the drag lease
outlives the save (the Codex v2.746 work-in-progress, ported with amendments) and a
released or lost lease refetches the scene so click-to-move, nudges and undo reach
peers; saves are bounded by a 15 s timeout; a pure click never writes; the legacy
`scene_tokens` echo respects held tokens; click-to-move stamps its own write.

Reproduced the "area doesn't register the tokens" report: combat participants were
per creature definition (a real UNIQUE constraint), Start Combat collapsed three
Goblin Scout tokens into one participant, the link trigger guessed an arbitrary
copy (sometimes on another scene), and the v2.743 lookup then dropped that
participant from every area, range and cover computation. Participants are now
per token and carry their placement's combatant explicitly (seed `combatantId`,
one seed per token, picker and NPC-manager placements pre-create the combatant);
`findTokenForParticipant` falls back to an unambiguous same-definition token and
resolves in two passes with a claimed set; the loader keeps identity for
`narrative_npc` and `srd_monster` placements; token HP bars and the active-turn
ring resolve combatant-first (creature tokens on the placements path had `npcId`
null, so DM monster moves were silently unenforced). Migration
`20260922120000_combat_participants_per_instance_v2_746.sql` replaces the
per-definition UNIQUE with per-combatant uniqueness; until it is applied,
`startEncounter` retries once per definition, so nothing regresses.

Every target list now ranks through one pure helper (`rules/targetOrder.ts`):
living enemies first, then allies, then creatures at 0 HP, then the dead — all
still selectable, badged DOWNED / DEAD with SRD 5.2.1 wording, in-range before
out-of-range, then closest. Area auto-select pre-checks living and downed tokens
in the area and lists dead ones as IN AREA, unchecked. The MonsterActionPanel
lock/unlock toggle is gone. Also fixed along the way: "Select within N ft" passed
the pixel grid size as feet per square (selected nothing under 70 ft); the
Actions-tab Cast button for area, multi-beam and heal spells never mounted its
picker; the Bless/Hex picker filtered on a dropped column and rendered empty;
legendary-action targets never joined combatants; end-of-combat character
carry-over sent columns the characters table lacks (400 on every character since
v2.477); a destroyed GridOverlay graphic threw on every map open.

Validation: type-check 219 → 212 (CI ratcheted), 1045 unit tests, build and entry
budget, RAW/coords/anchor checks, rules-of-hooks 0. Live on the local stack: five
drop scenarios (medium, Large, player on turn with DM peer, click-to-move, 7 s
delayed save) show no position change after release on either client; Start
Combat from Ruined Keep yields 13 participants bound to their own placements; a
20 ft sphere selects exactly the living goblin, the downed goblin and the ogre;
both pickers order enemies → allies → down → dead. DB-backed specs run on one
worker under `E2E_DB=1`.

Pending decisions (Jared): (1) the migration ships to PROD when it reaches main —
run the read-only duplicate pre-check first and say yes; the app degrades
gracefully until then. (2) Keep the cell-to-cell drag ghost or revert the flag.
(3) DM drags of the active monster are now movement-enforced, as the v2.414 gate
intended. Known limits: with the DM viewing a scene other than the combat's,
per-row distance lookups can map several participants onto one same-definition
token (needs an encounter → scene link); hex-labelled scenes still snap square;
"Duplicate token" copies never become participants; recruited-monster allies rank
as enemies until a faction model exists.

### 2026-09-20 — Spell and multi-target movement safeguards, v2.745

Spell targeting and DM multi-target save selection now wait for local movement
saves or active drag leases. Choices remain intact; nothing submits automatically.
DM save confirmation rejects selected targets that moved out of range and lets
the user deselect them. The picker was extracted from MonsterActionPanel.

Spell positions, footprints, distance warnings and derived cover now use live
token instances, including duplicate creatures. Scene changes reload geometry
without resetting target choices, and late responses cannot restore an old map.
Spell distance remains informational: area targets can lie beyond the casting
point. This does not add authoritative multiplayer attack/movement ordering.

Regression coverage exercises pending saves, rollback, retained selections,
duplicate-instance distance, cover refresh, scene response races and desktop/
mobile waiting and changed-range states.

### 2026-09-20 — Wait for movement before choosing attacks, v2.744

Player target selection, DM monster single-target selection and the Declare
Attack form now wait while the open map has an active drag, remote drag lease
or local movement save. A visible status explains the pause; completing a save
refreshes controls without requiring another token update. Nothing auto-submits.
Range uses the final live position, including rollback after a rejected move.

Regression coverage includes overlapping saves, local/remote dragging, scene
changes, success without a repaint, rejection rollback and desktop/mobile target
selection. This is a local UI safeguard, not server-side attack/move ordering.
Dedicated spell and multi-target save flows still need the same treatment.

### 2026-09-19 — Attack identity and movement refresh stability, v2.743

Reproduced two defects: duplicate monster definitions could resolve range from
the first copy, and an old refresh could overwrite a move completed during its
fetch. Token lookup now prefers the combatant instance, disambiguates legacy
copies by unique name, and declines ambiguous matches. Attack pickers and monster
highlights share live map geometry, including instance and footprint identity.

Initial, realtime and reconnect token refreshes share a guard against old or
out-of-order snapshots overwriting active, pending or newly completed movement.
Unrelated metadata still refreshes; missing rows still disappear. The reported
session has not yet been identified, so these are reproduced code defects,
not a claim that every possible range or post-drop issue is resolved.

Validation: 962 unit tests; TypeScript debt reduced from 221 to 219 and CI
ratcheted accordingly; full build, rules, coordinate and bundle checks passed.
Desktop/mobile tests confirm delayed refreshes cannot rewind a saved drop,
verify persisted positions and duplicate-instance lookup, and retain pending-save
and rejection recovery. Disabling position preservation reproduces a 70px jump
back on both axes. The picker regression verifies 40ft rejection then immediate
5ft eligibility after movement.

### 2026-09-19 — Adaptive map help placement, v2.742

Map help chooses the roomier side of the navigation dock, opening below when a
raised dock leaves little space above. It keeps the existing screen margin,
height cap and scrolling, and repositions when the dock moves or screen resizes.

Coverage checks placement geometry and desktop/mobile/landscape panel bounds,
scrolling and Escape behavior in the real map. No database changes.

### 2026-09-19 — Camera shortcut modal guard, v2.741

Zoom, Fit, Find and Previous View keys pause while a visible modal is open,
including when focus has not entered it and the pointer still hits the map.
Hidden mounted dialogs do not block navigation, and shortcuts resume on close.
This matches the existing temporary-pan safeguard.

Unit coverage checks native and ARIA dialogs, every camera action and recovery;
desktop/mobile browser coverage verifies unchanged camera coordinates and zoom
during the focus gap. No database or visual changes.

### 2026-09-19 — Named, touch-friendly color palettes, v2.740

Token and carried-light colors now use a consistent two-column palette with
44px targets, visible names, a selected checkmark and keyboard focus outlines.
Token hex values and light descriptions remain available in tooltips. Selection
continues to reflect confirmed saved state, including after a failed change.

Coverage checks names, selected states and save payloads, plus desktop/mobile
and short-screen target sizes and visibility. No database or lighting-engine
changes. Personal encounter mode remains queued.

### 2026-09-19 — Token submenu return, v2.739

Back, rename Cancel and Escape restore focus to the originating token option and
scroll it into view. Escape leaves a submenu first; a second press closes token
options. Held or composing Escape does not dismiss another level, and pending
saves remain protected. Leaving a failed edit clears its stale error.

Regression coverage exercises focus restoration, rename cancellation, pending
saves and composition, plus desktop/mobile submenu navigation in the real map.
No database or layout changes. Personal encounter mode remains queued.

### 2026-09-19 — Token-menu arrow navigation, v2.738

Focused token options now support Up/Down with wrapping and Home/End for the first
or last enabled visible action. These keys stay inside the menu instead of
reaching token-nudge handlers. Rename fields keep normal caret navigation and
modified/composing keys are ignored. Tab and Enter/Space behavior is unchanged.

Validation covers main-menu cycling and typing in unit tests and desktop/mobile
submenu navigation, focus, screen bounds and unchanged token positions in the
real map. No database or layout changes. Personal encounter mode remains queued.

### 2026-09-19 — Previous-view shortcut, v2.737

Press R over the map to return to the camera position and zoom saved before the
latest Fit/Find jump. It shares the arrow button's restore action and ignores
held repeats, typing, overlays and modified keys. Without a saved view it leaves
the key alone. Help and the arrow tooltip document the shortcut; token undo is
unchanged.

Validation covers shortcut ownership and history availability in unit tests, plus
desktop/mobile browser camera-position and zoom assertions, one-use return and
existing navigation/Space-pan/middle-pan behavior. No database changes.
Personal encounter mode remains queued.

### 2026-09-19 — Space-pan keyboard ownership, v2.736

Temporary Space-pan now checks the current pointer hit, visible modals, editable
ancestors (including empty/plaintext-only contenteditable), composition, handled
keys and pressed mouse buttons. Focused controls keep their normal keyboard
behavior; a token drag cannot turn into a camera pan mid-gesture. Pointer ownership
clears on blur and updates on button release. Escape still cancels an active pan.

Validation includes unit guards and desktop/mobile full-map regression coverage
for rich-text focus, a visible overlay, then normal Space-pan and middle-pan.
No database or layout changes. Personal encounter mode remains queued.

### 2026-09-19 — Cancellable middle-mouse panning, v2.735

Middle-mouse dragging now shares Space/Pan capture handling, including over tokens.
It shows the grabbing cursor, cancels on Escape/lost capture/blur, and suppresses
the browser's auxiliary click. A middle press while the primary button is held
does not take over a token drag. Map help documents the gesture. Camera movement
remains local; no token writes or schema changes are introduced.

Regression coverage checks actual camera movement, Escape cancellation, unchanged
token positions and selection, then existing Space-pan and framing behavior.
The new cursor assertion fails against the old implementation.
Personal encounter mode remains queued.

### 2026-09-19 — Clear dimension validation, v2.734

Scene settings preserves numeric drafts instead of truncating fractions as they
are entered. Blank, fractional and out-of-range dimensions are rejected before
any write, with the field name and allowed whole-number range shown in the
focused alert inside settings. Numeric fields have accessible names; Fit to map
image is disabled until grid size is valid.

Validation: full gate passed (936 unit tests, TypeScript 221/221, build and entry
budget). Fractional-value mutation fails three cases. Four isolated desktop/mobile
browser checks pass using the real dialog with intercepted save/delete responses:
invalid drafts never write, typed values survive, retries work, and short-screen
controls remain reachable. Removing validation feedback fails the browser test.
After Docker was restored, all four database-backed desktop/mobile checks passed:
invalid drafts, zero writes, correction, confirmed save/delete recovery and fog.
Screenshots inspected in the full app as well as the isolated fixture. No database
changes. Personal encounter mode remains queued.

### 2026-09-19 — Scene settings layout, v2.733

Scene settings scrolls its fields independently of the title and action footer.
Save, Cancel and Delete retain 44px targets and stay reachable on short screens,
including after save/delete errors. Radio buttons and the published checkbox have
explicit compact dimensions so global text-input styles no longer squeeze their
labels. Fog descriptions use the more readable secondary text color.

Validation covers the full gate and desktop/mobile settings, keyboard navigation,
save/delete recovery and a 480px-high viewport. No database changes.
Personal encounter mode remains queued.

### 2026-09-19 — Scene deletion recovery, v2.732

Scene deletion now requires a returned deleted row before removing the scene
locally. A synchronous reservation spans confirmation and the request, blocking
duplicate deletes, competing saves and dismissal while deleting. Failed requests
preserve drafts and allow retry. Save/delete errors now appear as focused alerts
inside settings, where the modal backdrop cannot obscure them.

Validation: full gate (923 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and entry budget); local desktop/mobile browser coverage holds and rejects
a deletion, verifies disabled controls and preserved drafts, then retries against
the database using a disposable scene. Existing settings/save/fog coverage remains.
API regression fails when returned-row verification is removed. No schema changes.
Personal encounter mode remains queued.

### 2026-09-19 — Confirmation dialogs above map settings, v2.731

Shared confirmations/prompts now render through the existing body portal at
z-index 40000, above scene settings (30000). Previously the scene-delete
confirmation existed in the DOM but settings covered it and intercepted pointer
clicks. The regression now clicks Cancel, reopens and tests Escape, preserving
settings drafts without deleting a scene.

Validation: full gate passed (921 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.5 KB entry). Four desktop/mobile browser checks
passed for scene settings/save/fog and fullscreen group confirmation/undo/reconnect.
The pointer Cancel check failed before the fix. Screenshots inspected on both
viewports; shared overflow probe found no dialog clipping or sideways scrolling
(existing underlying map/sidebar/party-bar findings remain). No schema changes.
Personal encounter mode remains queued.

### 2026-09-19 — Confirm scene settings before updating the map, v2.730

Scene settings applies its local patch only after the database confirms an
updated row. Failed/zero-row saves keep edits open with a retry message;
exceptions use the same recovery. A synchronous reservation blocks duplicate
saves, disables the form and prevents dismissal until the request settles.
The shared updateScene API now verifies an affected row instead of accepting
an error-free zero-row response. Permissions and schema are unchanged.

Validation: full gate passed (921 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile local browser checks
hold and reject a save, verify disabled controls, Escape blocking, unchanged
scene options and preserved draft text, then retry successfully and persist fog
strokes. Removing returned-row verification fails the API regression.
Personal encounter mode remains queued.

### 2026-09-18 — Scene settings keyboard ownership, v2.729

Scene settings is now a named modal dialog, so map shortcut guards recognize it.
Opening focuses the scene name; Tab/Shift+Tab stay within enabled visible
controls. Closing restores the opener. Escape dismisses settings without reaching
the map, but yields to a nested confirmation. Canceling scene deletion preserves
draft settings and restores focus to Delete Scene.

Validation: full gate passed (920 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile local browser checks
cover initial focus, both Tab boundaries, nested Escape, preserved draft text,
return focus, discarded edits on Cancel, then saving settings and persisted fog
strokes. Removing the nested-dialog guard fails the regression. No schema or
layout changes. Personal encounter mode remains queued.

### 2026-09-18 — Keep map undo out of dialogs and text editing, v2.728

Map Undo/Redo shortcuts now leave editable ancestors, ARIA textboxes/dialogs,
visible modal dialogs, composition, Alt-modified keys and already-handled events
alone. Empty history does not consume the shortcut. Held keys cannot drain the
history after each save finishes; a fresh press still works normally.

Validation: full gate passed (920 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile multiplayer checks
open the real group-delete confirmation, verify Ctrl+Z creates no movement writes
or position changes on either client, cancel, then verify normal undo/redo and
reconnect behavior. New unit tests fail against the previous implementation.
No schema/layout changes. Personal encounter mode remains queued.

### 2026-09-18 — Repeated framing preserves Previous view, v2.727

Repeated Fit map or Find selection no longer replaces the saved return point
when the destination matches the current camera (within floating-point noise).
A genuine position or zoom change still remembers the latest view. Held F/0
shortcuts run once per press; held zoom keys continue to repeat normally.

Validation: full gate passed (915 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
repeat Fit, F and Find selection, then verify restoration of the original camera.
Unit coverage includes unchanged views, rounding noise, zoom-only changes and
held-key behavior. Removing the unchanged-view guard fails two regressions.
No schema/layout changes. Personal encounter mode remains queued.

### 2026-09-18 — Return to the previous camera view, v2.726

The arrow beside Fit map restores the position and zoom from before the latest
Fit map or Find selection jump (including F/0 shortcuts). It is a single return
point, cleared after use or a scene/viewport change. Ordinary panning and zooming
do not overwrite it. Restoring stops camera momentum and supports fitted zooms
below 25%. Camera history stays local and separate from token undo.

Validation: full gate passed (912 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
passed for actual camera restoration after Fit/Find, disabled state after return,
and the existing navigation/help flow. Unit checks cover latest-jump replacement
and scene/viewport invalidation; removing center restoration fails two cases.
Screenshots inspected; shared overflow probe reports no new control clipping or
sideways scrolling (existing underlying map/sidebar findings remain). No new
mobile dock row. No schema changes; personal encounter mode remains queued.

v2.725 deployment was confirmed successful and live before this batch.

### 2026-09-18 — Shortcuts-first map help, v2.725

Map help opens with navigation shortcuts. Grid appearance now lives in a native,
keyboard-accessible disclosure below them, with a visible focus ring and a
44 px target. Grid preferences, reset and persistence are unchanged. Scoped
summary styles keep the help toggle separate from the nested settings control.

Validation: full gate passed (909 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
passed for shortcut visibility, Enter/Space expansion and collapse, and live grid
updates/reset/reload with no shared writes. Screenshots inspected; shared overflow
probe reports no new control clipping or sideways scrolling (existing underlying
map/sidebar findings remain). Forcing settings open fails the new regression.
The pan test now releases toolbar focus before Space and explicitly verifies
camera movement without token movement. No schema changes; personal play queued.

Release note: v2.724 was merged with passing CI, but Vercel had not created a
deployment and production still served v2.723 when this batch began.

### 2026-09-18 — Find selection keyboard shortcut, v2.724

Press F over the unobstructed map to frame selected tokens using the same
control-aware camera framing as Find selection. The key remains untouched when
nothing is selected, during typing/dialogs, modified browser shortcuts or active
pointer gestures. Help and the button tooltip now explain the shortcut.

Validation: full gate passed (909 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
compare the actual camera against button framing after panning away. Two new
regressions fail when F handling is removed. Help screenshots inspected after
scrolling to the shortcut; shared overflow checks show no sideways scrolling or
new control clipping (existing underlying map/sidebar findings remain).
No database changes. Personal encounter mode remains queued.

### 2026-09-18 — Click-to-move save protection, v2.723

Click movement now shares the per-token reservation used by dragging, nudging
and undo/redo, from validation through animation, save and movement logging.
Repeated clicks and drags explain why a move is busy. Failed position saves
restore the origin, spend no movement and display a retry message. Rejected
requests are handled immediately while animation finishes. No schema changes.

Validation: release gate passed (907 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop and mobile local-database
browser checks passed: held click save blocks a second click and drag with one
write, failure restores position/budget, and subsequent real player movement
persists and spends exactly 5 ft. Personal encounter mode remains queued.

### 2026-09-18 — Shared pending movement protection, v2.722

Single-token drag saves, group saves, arrow-key/button nudges and token move
undo/redo now share per-token save reservations in this browser. A pending member
blocks the entire formation before optimistic nudge/save changes; unrelated tokens
remain usable. Group reservations last until every member settles, and failures
release them. Old/repeated cleanup cannot release a newer operation's reservation.
Single-token drag no longer keeps a separate private pending set. Existing server
permissions and peer drag locks remain authoritative; this is local coordination.

Validation: release gate passed (903 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Unit coverage includes atomic group
reservation, cleanup ownership, failed saves, blocked nudges and undo retry.
Browser coverage extends delayed drag saves with a selected-token ArrowRight
attempt, unchanged position and one request, plus normal multiplayer group
cancel/undo/reconnect. No schema changes. Personal encounter mode remains queued.

### 2026-09-18 — Group move feedback and crowded names, v2.721

Group dragging outlines every original and snapped destination footprint, with
a zoom-stable token count/distance/Grid snap label. Dropping shows Saving group
move until the existing partial-success save path finishes. Cancel, scene teardown
and completion clear the overlay. Group permissions, shared grid delta and undo
semantics are preserved.

Single-token drops show Saving move while validation/persistence settle and block
another single-token drag of that token during the pending request. Existing
rejection feedback and origin restoration remain; save badges clear on completion
and viewport teardown.

Crowded names yield to token bodies, HP bars, conditions and status indicators.
Active/selected names take priority over other names; deterministic selection
prevents order-dependent flicker. Layout runs at most ten times a second and names
return when clear space opens. HP/status visibility and token hit areas are unchanged.

Validation: release gate passed (896 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Six desktop/mobile browser checks passed;
coverage
checks pending/rejected saves, second-drag blocking, group previews and multiplayer
cancel/undo/reconnect, plus colliding and separated names. Removing collision
filtering fails two regression cases. Screenshots inspected; shared overflow checks
found no sideways scrolling or new control clipping (existing underlying map/sidebar
findings remain). No schema changes; personal play stays queued.

### 2026-09-18 — Readable token drag feedback, v2.720

Single-token drag distance text, dashed paths and destination outlines now retain
their screen size when zooming. The destination has a tinted footprint and a
contrasting border; a faint origin outline distinguishes start from landing.
The distance label explicitly says Grid snap and stays within the canvas edges.
Existing size-aware snap, distance calculation and drop rules are preserved.
Blocked starts now explain remote drag locks, missing control, out-of-combat DM
control, wrong turns, locked tokens and exhausted movement instead of silently
ignoring the press. No authorization or movement-budget changes.

Validation: release gate passed (893 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Six desktop/mobile browser checks
passed for zoom-stable feedback, remote-lock explanations and multiplayer drag
cancellation, including zero persisted writes on cancellation. Screenshots
inspected; shared overflow probe reports no sideways scroll or new UI clipping
(existing underlying sidebar/map findings remain). Removing label counter-scaling
fails the regression. Personal encounter mode remains queued.

### 2026-09-18 — Rename directly in token options, v2.719

Token renaming now uses a focused, prefilled input inside the token menu instead
of a competing modal. Enter saves; Cancel/Back return to options; Escape closes
the menu without exiting the fullscreen map. Blank names cannot submit, whitespace
is trimmed, and failed saves retain the draft for retry. Existing confirmed-save
handling still prevents overlapping writes and premature local changes.

Validation: release gate passed (884 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks cover
prefill, focus, blank names, rejected Enter saves, retained drafts, cancel and
Escape, with unchanged fixture tokens. Screenshots inspected; no new rename-menu
clipping or sideways scroll. No schema changes. Personal encounter mode stays queued.

### 2026-09-18 — Confirmed token-menu saves, v2.718

Token edits, deletion and duplication now wait for the API's boolean success
before changing local state. The menu stays open with disabled actions while
saving, blocks overlapping requests and reports failure with a retryable menu.
False results and exceptions both fail; unsuccessful duplication no longer leaves
a phantom token. Late results cannot inject tokens into a different scene, and
existing realtime duplicate metadata is preserved. Errors after unmount use a toast.

Placement-backed locking/control reassignment now explains that those fields are
unsupported rather than pretending they persisted. Placement renames require a
real placement lookup and a returned identity row; zero-row renames fail.

Validation: full release gate passed (882 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Four desktop/mobile browser checks
passed, including a rejected edit, a real local-DB retry and fixture restoration,
plus existing keyboard/menu navigation. Unit coverage includes pending/double
clicks, false/throw failures, retry, deletion, duplicate failure, scene changes,
unsupported fields and zero-row renames. No migrations or permission changes.

### 2026-09-18 — Keyboard-accessible token actions, v2.717

Clickable token-menu rows and color swatches are native buttons with visible
focus outlines, Tab traversal and Enter/Space activation. Opening a menu focuses
its first action; submenus start at Back. Color swatches have explicit names and
pressed-state reporting. Space on a focused control no longer triggers temporary
map pan. Existing token handlers, permissions and save behavior are unchanged.

Validation: release gate passed (875 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Four desktop/mobile menu and camera
checks passed, including keyboard-only submenu entry/return, action names,
resize/landscape, touch dismissal and unchanged token data. Removing actions
from Tab order fails the regression. No database changes; personal play remains queued.
Two final desktop/mobile visual checks also passed. Focus screenshots inspected;
shared overflow checks found no new clipping or sideways scrolling (existing
underlying sidebar/map findings remain).

### 2026-09-18 — Return from token submenus, v2.716

Size, color, facing, light and player-control submenus now have a sticky
Back to token options button. Opening a submenu focuses Back for immediate
keyboard return. Outside dismissal uses pointer events so touch taps work
without relying on compatibility mouse events; the opening pointer event is
excluded. Internal taps and Back preserve the menu. Escape still closes the
menu without leaving fullscreen. Existing actions and permissions are unchanged.

Desktop/mobile browser coverage checks repeated submenu returns, Enter activation,
outside touch dismissal, landscape/resizing and unchanged token data. Disabling
Back fails the regression. No database changes; personal encounter mode stays queued.
Release gate passed (875 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and 252.4 KB entry). Four final desktop/mobile menu and camera checks passed;
screenshots inspected and shared overflow probe found no new clipping or sideways
scrolling, with existing underlying sidebar/map findings unchanged.

### 2026-09-18 — Reachable token menus, v2.715

Token options and every submenu now measure their actual rendered size rather
than assuming a 240px menu. Width/height are capped to the visible viewport;
long menus scroll, with 40px rows for easier targeting. Opening a different
submenu resets its scroll and recalculates placement. Window/visual-viewport
resizes and content changes reposition it within an 8px margin.

Escape now closes the topmost token menu before fullscreen listeners run.
Existing token actions and permissions are unchanged. Desktop, mobile and
landscape browser checks exercise resize while open, bottom-item reachability,
light submenu placement, Escape and unchanged token data. Screenshots inspected;
the shared overflow probe found no new menu clipping or sideways scroll.
Removing the height cap fails the regression. Personal-play planning remains
queued below; no database changes in this release.
Release gate passed (875 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build, 252.4 KB entry); four final desktop/mobile menu and camera-key checks passed.

### Queued 2026-09-18 — Independent player / personal encounter mode

**Requested by Jared; deferred implementation. Map improvements remain the
active priority.** Make the character sheet useful at an external table or for
solo play without requiring a DNDKeep campaign or granting campaign DM powers.

Current evidence: `createCombatStore` returns an empty encounter without a
campaign; the sheet mounts `InitiativeStrip` with `isDM={false}`, and its turn
advance/end controls are DM-only. Several reaction/death-save listeners are
campaign-gated. `resolveAutomation` already supports a null campaign and built-in
defaults; character settings already expose automation overrides. Audit which
sheet actions already work independently before adding duplicate controls.

Recommended delivery order:

1. **Track my turns (first useful release).** Owner starts a personal encounter
   directly from the sheet, explicitly starts/ends their own turn and ends the
   encounter. Between-turn state preserves reaction timing; a new turn restores
   only resources whose rules specify that timing. Reuse existing start/end-turn
   rules for conditions, durations and prompts. Short/long rests remain separate
   explicit actions. Do not infer enemy turns or automatically advance a table's
   initiative. Keep this small enough to use beside a physical game or other VTT.
2. **Personal automation preferences.** Expose existing Off/Prompt/Auto choices
   clearly for independent play, with Prompt as the proposed onboarding default
   where supported. Explain unsupported target/map-dependent automations rather
   than appearing to run them. Preserve existing users' saved preferences and
   campaign policy when joining shared play.
3. **Optional personal encounter tools.** Add simple private opponent records
   (name, AC, HP, initiative) and manual target outcomes for users who want more
   automation. Full monster/map/DM management is not required for the first slice.

Implementation constraints: use explicit personal-versus-campaign encounter
scope and owner-only access; never emulate this by making a player a campaign
DM or creating a hidden campaign. Reuse pure domain rules and existing sheet
resource updates, keeping encounter orchestration outside the large sheet root.
Design durable resume and duplicate-click/multi-tab protection before enabling
turn effects; a reload must not reapply saves, damage or resets. Joining shared
combat requires an explicit handoff that prevents two encounter clocks from
mutating the same character. Personal mode must not advance shared combat,
expose hidden opponents or alter other players' sheets.

Acceptance: a character with no campaign can start, take actions, end/start
turns, receive appropriate prompts, rest and resume after reload. Verify resource
timing, concentration, death-save prompts, effect expiry, failed saves/retries,
duplicate actions, ownership isolation and shared-combat handoff. Show what
changed and offer safe corrections without silently reversing later edits.

### 2026-09-18 — Map navigation keys, v2.714

With the pointer over the unobstructed map, +/- (or =) zoom and 0 fits the
scene. Shortcuts reuse the existing camera actions and leave token data alone.
Typing, composition, browser modifier shortcuts, active pointer gestures and
overlays retain ownership of input. Leaving the map, cancelling a gesture or
losing window focus clears hover ownership; clicked toolbar buttons may retain
focus without blocking the camera keys. Instructions appear in Map controls.

Validation: release gate passed (875 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build, 252.4 KB entry). Six final desktop/mobile shortcut,
preset and control-reachability checks passed. Removing the overlay hit-test
fails the safety regression. Screenshots inspected; shared overflow probe found
no sideways scroll or new help clipping (existing underlying sidebar/map
findings remain). No database changes; user hands-on testing remains deferred.

### 2026-09-18 — Quick map zoom presets, v2.713

The zoom percentage is now a keyboard-accessible picker for 25%, 50%, 100%,
200% and 400%. Intermediate wheel/pinch/Fit values remain visible. Choosing a
preset or using +/- stops residual pan momentum, retains the world center and
respects the live zoom limits. Camera changes do not save scene or token data.
The compact native picker fits the desktop and mobile navigation dock.

Validation: release gate passed (871 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build, 252.4 KB entry). Desktop/mobile preset and Fit checks
passed, including camera center, token state, no scene writes and keyboard input.
All eight final desktop/mobile preset, control reachability, Find selection and
touch-pan checks passed.
Forcing all presets to 100% fails the regression. Screenshots inspected; shared
overflow probe found no sideways scrolling or dock clipping, with existing
underlying sidebar/map findings. User hands-on testing remains deferred.

### 2026-09-18 — Clearer map tool rail, v2.712

Tool buttons now share sharp SVG icons, accessible names, pressed-state semantics,
keyboard focus rings and an inset active marker. Eraser, clear drawings and clear
walls have distinct symbols. Existing descriptions, DM/player visibility,
tool handlers and destructive-action confirmations are preserved. Coarse-pointer
targets grow to 40px. No icon font or heavy dependency was added.

The scrolling rail measures the actual navigation dock above combat/dice controls,
so its lower tools no longer hide behind the mobile dock. Button rendering and
rail measurement moved into battlemap components, shrinking the map root by
over 270 lines. User hands-on testing remains deferred; no database changes.
Validation: release gate passed (871 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, production build, 252.4 KB entry). Four final desktop/mobile
tool and player-combat checks passed. Forcing pressed-state reporting off fails
the regression. Screenshots inspected; overflow probe found no sideways page
scroll or new tool clipping, with existing underlying sidebar/map findings.

### 2026-09-18 — Compact selection toolbar, v2.711

The selection toolbar starts compact: selection count, movement arrows, More and
Clear. Lock/Unlock, Hide/Reveal and Delete expand on demand in an inline panel.
Mobile keeps movement on a dedicated row, reducing the normal mixed-selection
toolbar from three rows to two. Expanded actions remain labelled buttons with
the existing deletion confirmation and save-failure feedback.

More exposes its expanded state and controlled panel to assistive technology.
Escape closes the panel and returns focus to More without clearing the selection;
changing the selected group closes it automatically. Hidden actions leave both
layout and keyboard navigation. User testing remains deferred; no database changes.
Validation: gate passed (871 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build, 252.4 KB entry). All four desktop/mobile visibility
and group-drag checks passed; two final layout checks passed. Screenshots inspected.
Forcing hidden actions visible fails the new compact-state test. Overflow probe
reports no sideways page scroll or toolbar clipping; existing underlying
sidebar/map findings remain.

### 2026-09-18 — Reliable group token edits, v2.710

Group Hide/Reveal now targets only non-character tokens, matching its existing
tooltip promise. Group edits and deletions wait for each API confirmation before
changing local state, handle false results as well as exceptions, keep successful
changes on partial failure and explain what failed. Deletion failures also use
a toast so the message remains visible if fewer than two tokens remain selected.
An in-flight guard prevents overlapping batches and confirmation dialogs.

Both token backends now require a returned row for field updates and deletions;
RLS-filtered or missing rows cannot silently count as saved. Placement-backed
scenes still have no persisted lock field: group Lock/Unlock now explains that
limitation without making a local-only change. Adding placement lock persistence
remains a separate schema/gameplay task; this release has no migrations.

Tests cover mixed selections, pending saves, partial failures, rejected promises,
cancelled deletion, unsupported locks and zero-row API results. Removing the
character filter fails the regression. Browser checks inject an empty-row save,
verify unchanged tokens and then perform real local Hide/Reveal with cleanup.
User hands-on testing remains deferred.

The broader map regression also caught resize replacing v2.709's fitted zoom
floor and zooming mobile views inward. Resize now preserves the current scale.
Release gate passed: 870 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and 252.4 KB entry. Desktop/mobile visibility checks and the broader map
resize/navigation checks pass. The shared overflow probe reports no sideways
scrolling or new clipped controls; existing underlying sidebar/map findings remain.

### 2026-09-18 — Fit map clears controls, v2.709

Fit map now frames the full scene inside the space between the tool rail,
top controls and navigation dock. It shares bounds framing with Find selection.
Both lower the viewport zoom floor when needed, so the clamp no longer undoes
a fit on short landscape screens. Minus and pinch-out do not jump inward from
these smaller fitted views. Token coordinates and scene data are unchanged.

Pure geometry coverage checks scene corners, zoom caps and unavailable space.
Browser coverage checks all four scene edges against actual controls after
portrait/landscape resizing, zoom-button direction and unchanged token positions.
Removing clear-space framing fails the regression. Desktop and mobile screenshots
inspected. User hands-on testing remains deferred; no database changes.
Release gate passed (861 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and 252.4 KB entry). The broad browser run passed 19/20 cases; the mobile
group-drag test now uses Find selection after its toolbar opens, and passes in
both viewports. Final targeted framing, zoom round-trip, group-drag and pinch
checks pass. Overflow probe finds no sideways scrolling or new clipped controls;
existing underlying sidebar/map clipping remains.

### 2026-09-18 — Live grid appearance, v2.708

The map controls menu now offers Classic, Light and Dark grid colors, opacity
from 0–100%, stronger five-cell lines and a reset button. Preferences survive
reload on this device and affect only that viewer. The existing classic style
is the default; hiding lines does not disable snapping. No database changes.

Restyling retains the existing Pixi grid object and layer order; opacity changes
only its alpha, avoiding geometry rebuilds. Removed the obsolete duplicate color
constants. Closed help panels explicitly hide their controls from layout.

Validation covers preference parsing, actual rendered stroke colors/alpha,
stable layer order, unchanged tokens and zero scene writes, reload persistence,
reset, and desktop/mobile panel bounds. Disabling the alpha binding makes the
new browser regression fail (expected 0.3, received 1). Screenshots inspected;
the shared overflow probe reports no sideways page scroll or new panel clipping,
with existing underlying sidebar/map clipping still reported. User testing deferred.
Release gate passed: 859 unit tests, seven runner tests, TypeScript 221/221,
hooks, RAW/coords/anchors, build and 252.4 KB entry. All 18 desktop/mobile map
gesture and player-combat browser checks passed, including landscape help.

### 2026-09-18 — Artwork preview and proportional sizing, v2.707

Upload Map now opens a local preview before any upload. Fit inside preserves the
whole image with transparent padding; Fill and crop covers the map with centred
cropping. Both preserve proportions and existing scene/grid/token coordinates.
A preview-only grid-opacity slider helps judge alignment and never changes
exported pixels. Enlargement feedback flags artwork that may look soft.

The prepared image is saved as WebP (quality 94), bounded to a 4096px edge and
approximately eight million pixels, within the existing 5 MB upload limit.
Animated inputs become still frames. Padding/crop is baked into the saved image,
so the existing renderer and older clients need no new schema or fit metadata;
existing artwork is unaffected. Live-map grid opacity followed in v2.708.

The scene path changes only after an update returns a row. A failed scene save
keeps the uploaded path for Retry; cancellation or changing the preparation
discards uncommitted uploads with best-effort storage cleanup. The map root lost
upload handlers and hidden-input/status wiring to the dedicated component.

Validation: release gate passed (855 unit tests, seven runner tests, TypeScript
221/221, hooks, RAW/coords/anchors, build and 252.4 KB entry). New browser coverage
checks preview pixels, fit/crop, grid opacity without baked lines, cancellation,
zero-row save rejection, retry without duplicate upload and actual stored-image
rendering. Swapping Fit to crop fails the pixel regression. The broader map test
had an outdated canvas-centre assertion from before v2.705; it now checks the
selected token clears controls. Overflow probe found no page-wide sideways
scroll; it still reports underlying sidebar/map/closed-help content, while the
new dialog has explicit viewport/radio sizing assertions. User testing deferred.
All four final desktop/mobile artwork and map checks passed; preview and applied
artwork screenshots inspected.

### 2026-09-17 — Token borders and overview labels, v2.706

Tokens now have a layered shadow and a separate highlighted rim above portraits;
the old shared fill/stroke could be covered by the portrait sprite. Selection
adds a cyan rim, and active-turn rings have a dark backing stroke for contrast
over bright artwork. Portrait aspect ratio, circle crop and footprint hit areas
are preserved. Shadows use simple geometry, without per-token blur filters.

Below 65% zoom, unselected/inactive names are hidden. Selected and active names
remain available with a capped size boost; death-name strikethrough tracks that
scale. HP, condition, lock, cover and movement indicators retain their existing
visibility/permission rules. Camera-driven detail changes reuse the existing
animation loop instead of writing React or shared state on zoom.

The synthetic wide-portrait browser fixture verifies border draw order, aspect
ratio, overview hiding, selected-name restoration/enlargement and zoom-in
restoration. It blocks service workers and uses Pixi's main-thread image loader
for deterministic interception; it does not certify production worker fetching.
User hands-on testing remains deferred. No database changes.

Validation: release gate passed (846 unit tests, seven runner tests, TypeScript
221/221, hooks, RAW/coords/anchors, production build, 252.4 KB entry). All 16
desktop/mobile gesture and player-combat checks passed; four focused visual
checks passed again after correcting a connecting stroke caught in screenshot
review. Final screenshots inspected. Disabling overview hiding makes the new
browser regression fail; restored behavior passes. No physical-device FPS claim.

### 2026-09-17 — Selection camera framing, v2.705

Find selection now frames the union of selected token footprints, zooming out
only when needed. It uses the space to the right of the tool rail, below the
selection actions and above navigation, with breathing room around the group.
It centres the bounds rather than averaging token centres, so clustered groups
and large creatures do not push outlying tokens offscreen. Existing comfortable
zoom is preserved. This changes only the local camera, never token positions.

The regression reproduced offscreen selection on desktop and mobile before the
fix. Screenshot review then caught toolbar overlap; the final assertions require
the full selection to clear the rail, selection actions and navigation dock.
Pure geometry tests cover wide/tall groups, even/odd footprints, asymmetric
controls, single-token zoom preservation and empty/unmeasured views.

User hands-on testing is explicitly deferred. Continue automated map/navigation
and appearance improvements without treating that deferred testing as a blocker.

Validation: release gate passed (840 unit tests, seven runner tests, TypeScript
221/221, hooks, RAW/coords/anchors, production build, 252.4 KB entry). Four focused
desktop/mobile browser checks passed, including selection bounds, unchanged
token data/no position writes, zoom readout, sharp rendering and control access.
Final screenshots inspected. No database changes.

### 2026-09-17 — Interrupted gestures and landscape combat help, v2.704

Pan now cancels on lost pointer capture and hidden-tab transitions. Escape
cancels an active pan before the fullscreen handler can close the map. Capture
ownership is cleared before release, preventing stale gestures and recursive
cancellation. A fresh gesture works immediately afterward. Normal pinch-to-one-
finger navigation is preserved; camera gestures do not change token positions.

Combat help previously extended above the viewport at 851×393. It now measures
the space above the dock and scrolls within that space. The bounds update when
the dock moves/resizes, and scroll does not chain out of the help panel.

Regression coverage exercises mouse and Chromium touch capture loss, Escape,
simulated hidden-tab cancellation, recovery, and landscape help bounds/scrolling.
The old capture behavior and old landscape layout both failed the new checks
before their fixes. Optional 4× CPU slowdown coverage and a physical-device
checklist are documented in e2e/README.md. Actual-device smoothness, Safari touch,
thermal behavior and real-session acceptance remain pending; emulation cannot
certify those. No database changes in this release.

Validation: release gate passed (834 unit tests, 221 carried TypeScript errors,
clean hooks/RAW/coordinate/anchor checks, production build and bundle budget).
All 18 desktop/mobile map browser checks passed; both interrupted-pan checks
also passed at 4× Chromium CPU slowdown. This verifies recovery, not frame rate.

### 2026-09-17 — Player movement for DM-created characters, v2.703

Players can now save position changes for their character's DM-created placement
without transferring combatant ownership. The new UPDATE policy requires the
linked character owner, current campaign membership, matching character/combatant/
scene campaigns, a published scene, and a visible token. A trigger limits this
new permission to x/y and updated_at; identity, scene, appearance, rotation,
lighting, and visibility cannot be changed through it. Existing DM and combatant
owner permissions are preserved; INSERT/DELETE are not expanded.

A non-exposed helper with pinned search_path avoids the combatant/placement RLS
recursion found in v2.654. Anonymous execution is revoked. The real local combat
test now succeeds with DM ownership unchanged, including turn order and movement
exhaustion. It retains rejected-save rollback using one simulated zero-row reply.
Direct database-role probes cover allowed movement and denied identity/metadata
changes, deletion/insertion, other characters, nonmembers, removed members,
unpublished/hidden scenes, detached characters, and non-character combatants.

This resolves the v2.701 ownership blocker. Combat turn/budget UI checks and the
existing movement logging are unchanged; this is not a new server-side combat
budget enforcement system. Next: physical-device smoothness/touch acceptance,
then further map appearance work. Fog/lighting remain last.

Verification: required gate passed (834 unit tests, seven runner tests,
TypeScript 221/221, hooks, RAW/coords/anchors, build, 252.4 KB entry). All 16
desktop/mobile map browser checks passed. Removing the new policy fails the
allowed-move probe; removing the trigger fails the metadata-denial probe.
Reapplying the migration restores both, confirming idempotency. Local security
advisors report only the existing keep_warm search-path and client_errors INSERT
warnings; neither concerns the new private functions or policy.

### 2026-09-17 — Map presentation and high-density rendering, v2.702

The map now renders at display density, capped at 2x and an eight-million-pixel
budget above native resolution. CSS dimensions and world/pointer coordinates
remain unchanged. Token glyphs use 2x textures; names wrap within their token's
width rather than running into adjacent names. Uploaded low-resolution artwork
is not upscaled into new detail.

Navigation now has consistent SVG icons, a clearer active mode, restrained
surfaces, and a dedicated mobile layout. The permanent idle instruction overlay
is replaced by compact, keyboard-accessible help; active-tool instructions remain.
Help closes on Escape or an outside click. Reduced-motion preferences are honored.

The v2.701 player-combat ownership blocker remains open. This is a presentation
pass, not a change to database permissions. Physical-device performance and touch
acceptance remain open; headless browser checks are not a real-device FPS claim.

Verification: 834 unit tests, seven runner tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry passed. All 16 map browser checks
passed; final desktop/mobile close-ups also passed token-width, density, and
control hit-testing checks. Forcing density back to 1 makes the mobile regression
fail. Screenshots inspected. The generic overflow probe reports sidebar text
truncation and underlying campaign containers behind fullscreen; the fullscreen
dock has separate viewport-bound and occlusion assertions, which pass.

### 2026-09-17 — Visible history and player movement safeguards, v2.701

Undo and Redo now share the map navigation bar, show their action labels, and
disable while saving. Player fullscreen now fills the viewport; navigation
clears the combat strip and raised dice buttons on desktop and mobile.

Position saves now require a returned row. Previously an RLS-denied update could
look successful, leaving a ghost move and spending movement. Failed player drags
now restore the token, show an error, and preserve the movement allowance.

**Next release blocker:** the newer engine gives DM-created player-character
combatants DM ownership, while placement UPDATE requires combatant ownership.
The player can select their character but cannot save its move. This release
handles that denial honestly; it does not change database permissions. Fix the
narrow movement permission without granting character owners unrelated combatant
creation/deletion powers, and test a DM-created PC without changing fixture ownership.

The new local two-account combat regression covers denied saves, turn order,
other-character restrictions, and movement exhaustion. Its successful-save case
explicitly assigns the fixture combatant to the player; that is not evidence
that ordinary DM-created PC ownership is fixed. Physical-device touch remains
open. Appearance/clearer controls follow movement; fog/lighting remain last.

Verification: 830 unit tests, seven runner tests, TypeScript 221/221, clean hooks,
RAW/coordinate/anchor checks, production build and 252.4 KB entry. All 14 local
map browser checks passed; all eight affected movement/gesture checks passed
again after the final dice-button clearance fix. Desktop/mobile screenshots
inspected, with explicit fullscreen and control-separation assertions.
Disabling Redo, denied-save detection, or control clearance individually makes
the corresponding browser regression fail; all three fixes were restored.

### 2026-09-17 — Group dragging and move controls, v2.700

DMs can drag a selected group outside combat, preserving its formation and
complete footprints at map edges. Escape, pointer cancellation, and blur restore
the group. Successful saves form one undo action; failed members roll back.
The selection bar now has four one-cell movement buttons on desktop and mobile.
Pan mode takes priority over selected tokens. Combat keeps the existing
single-creature movement path. Group saves remain sequential, not atomic.

Two-account testing exposed a pre-existing Presence limit: repeated start/end
updates disconnect the drag channel. Connection membership now uses Presence;
short-lived Broadcast leases carry held token IDs, renew while dragging, clear
on release/disconnect, and expire after a lost release (within eight seconds).
This also fixes rapid single-token selection breaking subsequent live movement.
The map root shrank by 83 lines as sharing moved into its own hook.

Verification: 825 unit tests, seven runner tests, TypeScript 221/221, clean hooks,
RAW/coordinate/anchor checks, production build and 252.4 KB entry. Desktop/mobile
local multiplayer checks cover group cancellation, locks, undo/redo, visible
movement buttons, reconnect, and Pan priority. All 12 map browser checks passed.
Screenshots inspected; disabling group dragging makes the new regression fail.

Next: visible redo controls and player combat movement acceptance, followed by
map appearance/clearer controls. Physical-device touch remains open. Fog last.

### 2026-09-17 — Group nudge history and reconnect, v2.699

DM arrow-key group moves outside combat now record one undo, preserve the
formation at map edges using complete token footprints, and refuse held tokens.
Position saves are checked; a partial failure records only successful moves.
Token undo/redo checks for newer positions and held tokens before saving, retries
only unfinished members after a partial failure, and leaves failed history
available. Repeated undo shortcuts cannot overlap requests. Failures show a toast.
These are client conflict checks, not an atomic multiplayer transaction.

Rejoining the token subscription fetches current positions missed while offline.
Responses from old scenes or superseded reconnects are ignored; a held local
preview is preserved. A two-account browser regression disconnects a player,
moves two selected tokens, reconnects, then exercises group undo/redo and restores
their positions. Removing reconnect refresh makes that regression fail.

Verification: 817 unit tests (16 new), seven runner tests, TypeScript 221/221,
clean hooks and production build, 252.4 KB entry. Twelve real-local-DB browser
checks passed across desktop/mobile, including the two-account reconnect test;
screenshots inspected. Physical-device and player-combat acceptance remain open.
The mobile selection toolbar now sits below the header, beside the tool rail;
desktop/mobile rechecks pass and restoring its old top position fails the new
layout assertion.

Next: pointer-based group dragging, visible/mobile group-move and redo controls,
player combat movement acceptance, then appearance/controls. Fog remains last.

### 2026-09-17 — Touch and shared token gestures, v2.698

Pan mode now supports two-finger pinch anchored under the midpoint and returns
smoothly to one-finger panning. Token drags belong to the pointer that started
them: another pointer cannot move or drop the held token. Escape, pointer
cancellation and window blur restore the origin and release the shared lock;
Escape cancels the gesture before closing fullscreen. Cancelled previews do not
write a position to the database.

Two-account testing exposed stale drag locks in realtime-js 2.103.3: its presence
adapter mutated Phoenix metadata, retaining old held-token entries after release.
Pin realtime-js to 2.116.0 through an npm override, while keeping supabase-js at
the previously locked 2.103.3. The wider SDK upgrade changed unrelated database
typing; it is deferred. Remove the override when upgrading the parent SDK to a
version containing the presence fix.
The fixed realtime client requires Node 22+; CI and the package engine now
declare that minimum (this machine runs Node 24).

Local desktop/mobile regressions exercise DM-to-player live movement, snapped
position saves and return moves, cancellation on both accounts, lock release,
unrelated pointers, and native Chromium touch pinch/pan. Physical-device touch,
player movement during combat, group movement/undo, and reconnect acceptance
remain the next token-handling batch. Appearance/controls and fog follow that.

Release gate: 801 unit tests, seven runner tests, TypeScript 221/221,
clean hooks, RAW/coordinate/anchor checks, production build and 252.4 KB entry.
Removing Escape cancellation or pinch zoom makes the new browser regressions
fail; desktop and mobile screenshots were inspected.
All ten local map browser checks passed together: navigation, manual fog,
wall controls, two-account token movement and touch gestures, at both sizes.

### 2026-09-17 — Map experience, v2.697

Jared's priority order: (1) navigation and token handling, (2) appearance and
clear controls, (3) fog and lighting. Roll20 is the interaction reference;
parity is a multi-batch effort, not a claim about this release.

Navigation foundation implemented: explicit Select/Pan modes, temporary
Space-drag, live zoom percentage, Fit map and Find selection (including correct
large-token centers). Panning starts over tokens without moving/selecting them.
Canvas sizing now initializes after scenes load; resizing/fullscreen preserves
the live viewport and camera. Small maps can be panned freely. Scene controls
wrap on narrow screens and the tool rail scrolls rather than disappearing below
the map. The local fixture now handles the beta character cap transactionally.

Next acceptance batches, in order:
- Token handling: test group selection/movement, snapping, undo, touch gestures,
  ownership/locks and reconnect behavior with DM and player side by side.
- Appearance/controls: consolidate the tool palette, readable token names and
  state indicators, useful empty/upload flows, and unobstructed mobile controls.
- Fog/lighting: verify DM preview matches player visibility, then improve wall
  authoring and lighting feedback. Preserve existing visibility permissions.

Verification: full gate passed (801 unit tests, seven runner tests, 221/221
TypeScript baseline, clean hooks, build and 252.4 KB entry). Six real-local-DB
browser tests passed across desktop/mobile viewports: camera/navigation, wall
controls and manual fog. Restoring the old resize behavior makes the camera
identity regression fail. Screenshots and navigation bounds were checked.
Scene settings now scroll within the screen and render above mobile navigation
and dice controls; the existing fog test exercises Save successfully on mobile.
Actual touchscreen gestures and two-account movement remain in the next batch.

### 2026-09-16 — Release readiness

The next milestone is the invite-only, no-store beta defined in `betaMode.ts`.
Ordered action items, solutions and acceptance criteria:
[RELEASE_READINESS.md](RELEASE_READINESS.md). Start with a shared local/CI gate
(`npm run verify`), then finish save/draft validation, auth recovery, database
certification and a two-account playthrough before release.

Account recovery implemented: profile reads stop loading after 12 seconds;
late results cannot restore another account's profile or grants. Settings keeps
sign-out reachable without a profile and offers retry after failure. Eight new
mocked regressions plus desktop/mobile recovery-panel checks; live auth and
multiplayer acceptance remain open in the release checklist.
**Current version:** v2.665.0

### 2026-09-10 — User-experience foundation, v2.695.0 (local; not deployed)

First implementation batch from Jared's user-first product review:
- Character-sheet saves now serialize/drain partial changes and retain failed
  patches for explicit retry. The queue survives route changes; a cross-page
  notice links back to failed saves. Pending changes trigger the browser's
  supported before-unload warning. This is not durable offline combat storage.
- Character creation saves an account-scoped, versioned draft on this device,
  with Resume/Discard, storage-failure feedback and cleanup after creation.
- Mobile New goes to the existing character creator route.
- Landing page describes current beta allowances instead of an unavailable shop.
- Unit test discovery is scoped to src/ to avoid collecting nested worktrees.

Verification and next UX priorities: [USER_EXPERIENCE.md](USER_EXPERIENCE.md).

This document is the durable map for DNDKeep's development. It exists so that
progress can continue across sessions without re-deriving context, and so the
parallel efforts don't drift into each other's risk budgets.

> **2026-08-12 — Track 3 was retired.** The roadmap ran three tracks until the
> separate Roll20-caliber mini-app was killed and its goals folded into Track 2.
> See [Track 3 — retired](#track-3--retired-2026-08-12) for the reasoning.

---

## The core principle: two tracks, two risk profiles

DNDKeep's development is split into two tracks that deliberately do **not**
compete for the same risk budget. Each has its own cadence and its own tolerance
for breakage.

| Track | What | Risk profile | Cadence |
|-------|------|--------------|---------|
| **1 — RAW accuracy + automation** | Correctness of rules data; detection/verification automation | Low tolerance for silent error. Human-gated. | Gated sessions when real RAW work exists |
| **2 — The map** | Evolve the production map toward Roll20 parity; keep + improve automations | Production, so gated — but engineering, not rules-judgment | Daily default; small visible ships |

The split is by **kind of judgment**, not by feature area. Track 1 is rules
judgment, where a silent error is a wrong number in someone's game and no test
catches it — so a human decides every edit. Track 2 is engineering, where the
gate (tsc, build, tests, hooks) actually catches regressions, so iteration can
move fast. Keeping them apart stops map velocity from leaking into rules data.

---

## Track 1 — RAW accuracy + automation

**Goal:** Get the site as automated and as close to 2024 D&D rules as possible,
using only official content. No invented spells, monsters, or mechanics.

### Content scope rule (LOCKED — Interpretation B, hardened v2.552)

- **Canonical source:** SRD 5.2.1 (CC-BY-4.0) is the canonical verbatim source.
  Where an entry exists in SRD 5.2.1, its rules text should match the SRD
  **exactly** — audits verify against the SRD PDF, not third-party wikis
  (wikis are used only for cross-checking non-SRD mechanics).
- **Mechanics:** Full 2024 rules implemented. Numbers, scaling, and rules behavior
  are not copyrightable and may be implemented in full (2024 PHB / MM / DMG).
- **Verbatim text:** Descriptive/flavor text may be reproduced verbatim **only**
  for SRD 5.2.1 / 5.1 content (licensed CC-BY-4.0). Non-SRD content gets full
  mechanical support with **paraphrased or original** descriptions — never
  copied PHB prose.
- **Attribution:** The `/srd` page carries the exact SRD 5.2.1 and SRD 5.1
  attribution statements required by CC-BY-4.0. This must remain reachable
  from the app at all times.
- **Source tagging (rolling):** As entries are audited, tag them
  `srd-5.2` / `srd-5.1` / `paraphrase` / `legacy` / `homebrew` so compliance
  is machine-checkable. New content added going forward must be tagged.
- **Official only:** No invented spells, monsters, subclasses, feats, or mechanics.
  Every entry traces to an official WotC source.
- **Legacy sources:** Where no 2024 version exists (e.g. Artificer = TCE), the
  pre-2024 official version is allowed, tagged as legacy, refreshed when WotC
  publishes a 2024 replacement.
- **Psion:** Private homebrew (UA-derived), RLS-scoped to the owner's account,
  **excluded** from all RAW audits and the regression suite. Not shipped to
  standard players.

> **Legal note:** The above is a product/accuracy posture, not legal advice.
> Claude is not a lawyer. Before a commercial launch, a real IP attorney should
> review the licensing posture (SRD CC-BY-4.0 attribution requirements, the
> mechanics-vs-expression line).

### Automation posture (LOCKED)

Track 1 automation is **detection and verification only** — never unattended
editing of rules data.

- **Safe to automate:** regression suite that asserts known-good RAW values,
  CI gate, duplicate/consistency scanners, drift detection that opens issues.
- **Human-gated:** every actual edit to rules data. Claude verifies against
  official sources; the human makes the judgment call; ships are gated deltas.
- **Never:** a cron that finds, edits, verifies, and auto-merges RAW data with no
  human in the loop. This compounds silent errors into production and is
  explicitly out of bounds. (See RAW_AUDIT_2024.md: errors compound.)

### Backlog (from RAW_AUDIT_2024.md sequence)

Shipped: v2.547 (quick wins #4/#12/#18/#21), v2.548 (spell cleanup S3/S4/S6/S7/S10).

Outstanding:
- **Description corrections:** #2 Divine Spark, #3 Relentless Rage, #9 Druid Wild
  Shape temp HP, #11 War Magic, #14/#15 Berserker.
- **Scaling tables (QC carefully):** #1 Cleric CD (L18 not L11), #5 Paladin CD.
- **Feat rewrites:** #6 Lucky, #7 Alert, #8 Skilled, #17 Tavern Brawler.
- **Save-DC architecture:** #10 Intimidating Presence (class-DC SaveSpec).
- **Additive spell content:** S1 Divine Smite, S2 the 11 missing 2024 PHB spells.
- **Artificer backfill:** S8 (~80 spell class-list additions), legacy-tagged.
- **Playtest hygiene:** strip Psion-UA spells from non-Psion class lists.
- **Regression suite:** encode all corrected values as assertions (see Track 0).

### Character size selection (queued — v2.652 dependency)

**Ask:** let a player choose their character's size where the 2024 species
permits it, and have that choice feed the cover rules that landed in v2.652.

**Why it's blocked on nothing but time:** `src/rules/cover.ts` already gates
creature cover on size (`creatureCoverContribution`, `CREATURE_COVER_MAX_SIZE_GAP`)
and the whole path reads a size label end to end. Today that label always comes
from the token, which defaults to `medium` — so the gate is real but nobody can
move it. This work is what makes the choice matter.

Scope:
- **Data:** `SpeciesData.size` is a single `CreatureSize` (`src/data/species.ts` —
  currently 12 × Medium, 2 × Small). 2024 PHB lets **Aasimar, Human and Tiefling**
  pick Small *or* Medium. Widen the field to allow a choice set, leaving fixed-size
  species as they are.
- **Character:** no `size` column exists on `characters`. Add one (idempotent
  migration), defaulting to the species' fixed size so every existing character is
  unchanged.
- **Creation + settings UI:** a size picker that only appears for species offering
  a choice; validate the pick against that species' allowed set on write.
- **Token:** PC tokens hardcode `size: 'medium'` (`BattleMapV2.tsx` ~L1634) — derive
  from the character instead, so a Small character occupies a Small token and gets
  the cover treatment their size earns. (v2.657 did this via the species seam in
  `CampaignDashboard`; the remaining piece is the per-character override.)
- **Not in scope: drawing Small tokens smaller.** Settled 2026-08-12 — Small and
  Medium occupy the same 5-ft space in the 2024 rules, so they render
  identically. See the Track 2 note.
- **Knock-ons to check:** carrying capacity (Powerful Build already counts as one
  size larger), Halfling Nimbleness ("move through the space of a creature one size
  larger"), grapple/shove size limits, and Naturally Stealthy.

### Choice pickers: show the full text, always — **shipped v2.670 + v2.671** (complete)

**Ask (Jared, from the Psionic Disciplines picker):** every description should be
expanded by default, and the **Less** button should go entirely. You are choosing
between mechanics you have to compare — you read all of them, every time — so
truncation is pure friction.

**Where:** `src/components/CharacterSheet/PendingChoicesAlert.tsx` (~L221-230). The
row renders `{isExpanded ? 'Less' : 'More'}` against `expandedDisc`, which holds a
**single** id — so opening one description collapses the previous one. That is the
real cost: comparing two disciplines is impossible without toggling back and forth
between them.

Scope:
- Drop the `expandedDisc` state and the toggle button; render `disc.description`
  in full on every row. Deleting state is the whole fix — no "expand all" control,
  which would just be the same friction with an extra click.
- Check the surrounding scroll container still reads well once every row is tall:
  the list is inside a fixed-height scroller, and full text on ~10 disciplines
  makes it much longer. If it gets unwieldy the answer is a taller panel, not
  re-truncating.
- **Apply the same rule to the other choice pickers, not just disciplines.** Same
  file handles the other pending-choice types; whatever else truncates a mechanic
  the player is choosing between should stop. Audit before changing, so this lands
  as one consistent rule rather than a one-off.
- `DMlobby.tsx:97` has the same `More`/`Less` pattern — **out of scope**, and worth
  saying why: that one expands a campaign blurb you are reading, not comparing.
  Truncation is reasonable there. This rule is about *choosing*, not *reading*.

**What shipped (v2.670):** both Psionic Discipline pickers —
`PendingChoicesAlert.tsx` and `LevelUpWizard.tsx`'s `DisciplineStep`. Expand state
and the More/Less (▼/▲) buttons are gone, every row renders the full description,
and both scrollers went `300`/`360px` → `min(60vh, 520px)` rather than re-truncating.
Verified in a browser at 1280 and 393px.

Two traps the wizard hit, worth knowing before the remaining pickers are done:
`globals.css` sets `white-space: nowrap; overflow: hidden` on **every** `button`, so
a description moved inside one is silently clipped to a single cut-off line — the
text must sit outside the button. And a `flex-direction: column` list with a
max-height shrinks its rows by default, squashing full-length descriptions into each
other until the rows get `flex-shrink: 0`.

**What shipped (v2.671):** the feat and spell pickers, closing the rule out. The
audit had found no second picker left in `PendingChoicesAlert.tsx` — the
cantrip/spell prompts moved to `SpellCompletionBanner`, which doesn't truncate — so
the remaining friction was in three shared/creation surfaces, all of which lost
their expand state:
- `LevelUp.tsx` `FeatCard` — was `slice(0,100)` + a per-card ▼; now full
  description and benefits on every card, list `320px` → `min(60vh, 520px)`.
- `shared/FeatPicker.tsx` — was a one-line CSS ellipsis + a single `expanded` id
  with expanding coupled to selecting; now every row carries its full description,
  prerequisites, ASI and benefits, and a row click just selects. The duplicated
  description inside the old expanded block is gone. Serves CharacterCreator's
  StepBuild and LevelUpWizard.
- `shared/SpellPickerDropdown.tsx` — description and stat line always shown; the
  row is no longer a clickable expander (Add/Remove is the only action) and the
  duplicate Add/Remove pair that lived in the expanded block went with it.

Both `LevelUp`'s feat list and the earlier discipline lists hit the same
`flex-shrink` trap noted above — worth assuming it applies to any list of this
shape. Verified in a browser at 1280 and 393px.

Deliberately left truncated, both being *reading* not *choosing*: `DMlobby.tsx:97`
(campaign blurb) and `FeatPicker`'s closed trigger, which summarises the feat you
already picked.

---

## Track 2 — The map (daily iteration)

**Goal:** Evolve the production map toward Roll20 parity, in place, one gated
ship at a time. It starts graphically minimal (import a picture for
token/background) but carries all current automations. Keep the automations,
improve them, add capability.

Since Track 3 was retired (2026-08-12) this is the *only* map track: there is no
separate graphics-rich app to defer ambitious features into. Anything that would
once have been "Track 3 work" is now a Track 2 backlog item that has to earn its
way through the normal gate. The parity tiers are listed under
[Roll20 parity](#roll20-parity-inherited-from-track-3) below.

**What exists today:** PixiJS canvas, token placement (`scene_token_placements`),
`combatants` source-of-truth, SAT-based AOE footprint hit-testing, cone/line
geometry, 8-way direction snapping, reach visualization, concentration indicator,
action-economy ring, condition/immunity systems.

**Risk:** Production, so the gate applies (tsc ≤ the carried baseline —
see `TS_BASELINE` in `.github/workflows/ci.yml` for the current number — / TS2304 = 0,
rules-of-hooks clean, vite build). But this is engineering, not rules-judgment, so
iteration can move faster than Track 1.

**Candidate backlog (to be prioritized):**
- **Cover from walls — shipped in v2.661.** `wall_type` is no longer dead code:
  `scene_walls.wall_type` stores the material, a picker in the wall toolbar
  (`battlemap/WallTypePanel.tsx`) sets it for new walls, ctrl+click retypes an
  existing one, and `coverWalls` in `battlemap/coverState.ts` resolves it onto
  `CoverWall.type`. Closed doors now score as doors (total cover) instead of
  half, derived from `doorState` rather than stored twice.
  - **Existing walls were deliberately NOT backfilled.** They stay NULL and keep
    scoring as legacy untyped (half cover each). Converting them to solid would
    be the "correct" reading, but it silently upgrades every wall on every live
    map to total cover mid-campaign — a gameplay change, not a migration. The
    opt-in `update` is in the migration's header comment. **Live maps therefore
    see no change until a DM opts in or redraws.**
  - Not verified in a browser yet — Docker was down when it shipped, so the
    toolbar and the three wall colours have only been checked by unit test and
    build. Worth a look on next run.
- **Terrain objects — deliberately deferred (2026-08-12).** Crates, pillars,
  boulders as a cover source. Jared's call: *walls only for now* — get walls
  plus fog of war genuinely solid before widening the surface. When it is
  picked up, the choice is typed low walls (which would now reuse the whole
  v2.661 pipeline for free) versus a first-class object entity with its own
  cover level; `combineCover` already takes a third blocker source either way.
- **Walls + fog of war is the current focus.** Sequenced deliberately, since
  the wall system and the lighting system are the same system viewed twice —
  a wall's material has to answer both "how much cover" and "can you see
  through it".
  - ~~Materials drive line of sight~~ — **shipped v2.662.** Windows and low
    walls transmit sight while still granting ¾ and half cover; solid walls
    and shut doors block. Before this every wall was opaque to vision, so an
    arrow slit fogged a room exactly like a stone wall.
  - ~~Per-character vision range (the v2.226 TODO)~~ — **shipped v2.663.**
    Sight range is `sightRadiusFt` (`src/rules/vision.ts`): unlimited in
    bright and dim (lightly obscured is disadvantage, not a distance cap),
    and in the dark the better of the creature's darkvision and its own
    light. Darkvision is resolved from the species table at the same
    `CampaignDashboard` seam that resolves token size.
  - ~~Light sources~~ — **shipped v2.663, completed v2.665.** v2.663 put
    `light_radius_ft` on a token (None / Candle / Torch / Lantern /
    Daylight in the context menu), because darkvision alone would have
    left every Human blind the moment a scene went Dark. v2.665 made any
    token carrying a light actually *emit* it, so a token named "Brazier"
    lights the room — no `scene_lights` table, because a light source is
    a thing at a position that can be placed, moved, hidden and synced,
    which is the definition of a token.
    - Emission is gated on a PC having line of sight to the source, or a
      brazier would light its room for the party from anywhere on the
      map. The gate tests the source's centre point, so light spilling
      around a corner from a lamp you cannot see is not shown — the
      error is conservative (hides light, never reveals a dark room).
      Fixing it properly means intersecting visibility polygons per
      (viewer, light) pair.
    - ~~Separate bright/dim bands~~ — **shipped v2.666.** The fog is no
      longer binary: a light erases its bright band completely and its
      dim band most of the way, leaving a murk. `lightBandsFt` halves
      the stored total, which is exact for all four presets (every RAW
      light sheds dim for as far again as it sheds bright), so no
      migration was needed — the information was always in the column.
      - **Darkvision now reads as DIM, not bright**, per RAW: within the
        radius you treat darkness as dim light. The visible change is
        that a Dwarf's 60 ft is murky rather than daylight-clear.
      - The dim tier composites through its own RenderTexture. 'erase'
        multiplies, so drawing dim discs straight onto the fog would
        compound where they overlap and four Dwarves standing together
        would out-shine a torch. Flattening the union first makes
        overlap idempotent — two candles do not make bright light.
      - Fixed in passing: the Candle preset stored 20 ft while its own
        hint said 5 + 5. A candle lit as far as a torch's bright band.
        Invisible while the fog was binary; obvious once bands drew.
    - ~~Coloured light~~ — **shipped v2.668.** `light_color` (0xRRGGBB,
      NULL = untinted) on BOTH token tables with a mirror trigger, same
      shape as v2.663; six named swatches in the token context menu,
      offered only once a token actually carries a light.
      - Rendered as an additive polygon in a container BENEATH the fog
        sprite. It cannot go in the fog texture — that texture is an
        alpha mask being erased, so colour painted where alpha reached 0
        is invisible by construction. Under the fog is also what makes a
        second visibility gate unnecessary: tint in an unseen region is
        covered by opaque fog and tint in a dim region shows through at
        the dim tier's residual alpha, so it grades itself.
      - **Masked to the world rect.** A light near the edge throws a
        polygon past the map, and out there is no fog to attenuate it —
        first attempt smeared bright orange across the empty page.
      - **The DM does not see the tint in normal DM view**, because
        VisionLayer does not mount at all when fog is off. Consistent
        with the DM seeing no fog either, and Player View previews it.
        Worth revisiting only if setting mood without toggling preview
        turns out to matter at the table.
  - ~~Manual fog~~ — **shipped v2.664.** `scenes.fog_mode` picks per scene
    between `dynamic` (line of sight, the v2.224–v2.663 behaviour, still
    the default) and `manual` (the DM paints reveals with the ☁ brush and
    they stay revealed). Switching modes does not clear the painting, so
    a DM can flip to dynamic for a fight and back. Reveals are grid cells
    in `scenes.revealed_cells`, one write per stroke rather than per
    pointer-move.
    - ~~Rectangle reveal~~ — **shipped v2.667.** A Brush/Rect toggle in
      `FogBrushPanel`; Rect drags one diagonal and applies on release,
      previewing the rectangle live while the drag chooses its far
      corner. Most map features are rectangular rooms, which the round
      brush could only approximate by scrubbing the corners and still
      catching a cell of the corridor outside.
      - Size buttons are hidden rather than disabled in Rect mode — the
        drag *is* the size, and a visible-but-inert control reads as
        broken.
      - **No lasso.** A freeform polygon would be a third interaction
        for a case the freehand brush already covers; rect handles the
        regular shapes, brush the irregular ones. Revisit only if a
        real map wants a shape neither can express.
    - ~~"Reveal what the party has already seen"~~ — **shipped v2.669
      as `fog_mode = 'remembered'`**, the third mode. What the party can
      see right now renders exactly as `dynamic`; everywhere they have
      been keeps its WALL LAYOUT drawn over otherwise-solid fog, like a
      dungeon-crawler automap.
      - **Contents stay hidden, by construction.** The fog over a
        remembered cell is never erased even slightly. Tokens render
        BENEATH the fog, so any erase at all would leak a monster
        standing in a room the party walked out of; structure is drawn
        ON TOP instead. You remember the room, not its occupants.
      - **Players explore, not just the DM** — moving your own token
        uncovers the map. Players have no UPDATE on scenes and must not
        get one, so this goes through `explore_scene_cells`, a SECURITY
        DEFINER function that checks campaign membership and can only
        ever UNION cells in. Verified: a seeded player's cell lands, a
        non-member is refused, `anon` is refused at the grant, and a
        repeat call does not change the count.
      - `explored_cells` is a SEPARATE column from `revealed_cells`.
        Merging them would overwrite the DM's hand-painted manual fog
        the first time anyone switched modes. Remembered mode renders
        the union, and the ☁ brush stays available in it so a DM can
        still mark "they were told about this wing" by hand.
      - Writes are batched (1.2 s) — the recompute fires on every token
        move, and a write per step is a write per footfall. Memory is
        add-only, so a dropped batch costs nothing: the next recompute
        sends those cells again.
      - **Accumulation needs someone watching.** It happens on any
        client rendering fog — every player, and the DM in Player View.
        A token moved while no player is connected AND the DM has
        preview off records only where it ended up, not the corridor it
        crossed. At a live table that does not arise; if it ever does,
        the fix is letting the DM's client compute without rendering.
  - **Per-player fog** is still party-shared (the v2.225 note in `VisionLayer`).
    Matches Roll20/Foundry defaults, so this is a preference rather than a bug —
    revisit only if a table wants split parties to see separately.
- **Pointer group-drag (deferred from v2.653).** Multi-select shipped with
  marquee sweep, shift-click, a bulk action bar (lock / hide / reveal / delete)
  and arrow-key nudge — but dragging a whole selection with the mouse was left
  out on purpose. TokenLayer's drag path enforces per-creature movement budgets,
  wall collision, remote drag locks and the active-turn gate; "move six tokens
  at once" has no honest answer during combat (six separate budgets), and
  bolting a bulk path onto that pipeline risks the single-token drag everyone
  relies on. Arrow-key nudge covers aligning a cluster out of combat. Do this
  properly when the drag pipeline is next refactored, not before.
- ~~**RLS recursion on `scene_token_placements`**~~ — **fixed in v2.654.**
  `stp_player_update_owned_combatant` (v2.616) subqueried `combatants` while
  `combatants_player_select_via_placement` (v2.309) subqueried placements right
  back; Postgres evaluates all permissive policies, so every placement UPDATE
  died with 42P17. Resolved with a `SECURITY DEFINER` ownership helper so the
  placement policies stop re-entering combatants' policies. Left here as a note
  because the failure mode (mutually-recursive permissive policies) is easy to
  reintroduce the next time a policy subqueries across these two tables.
- Grid tooling: square/hex, adjustable size, snap-to-grid.
- Measurement/ruler in grid units.
- Basic drawing primitives (shapes, freehand) if they serve automation.
- Automation improvements surfaced from live play.
- ~~Should Small tokens render smaller?~~ **Settled 2026-08-12: no.** A Small
  creature and a Medium creature both occupy a 5-by-5-ft space in the 2024
  rules — size only changes the occupied area at Large and above (Tiny is the
  exception below Medium, taking 2½ ft, and `tokenRadiusForSize` already draws
  it at `0.5` for distinction). Drawing Small smaller would imply a mechanical
  difference that does not exist, and would shrink every Small monster as a
  side effect. Small and Medium stay identical at `0.95`.

### Roll20 parity (inherited from Track 3)

Folded in when Track 3 was retired. Roughly ordered by dependency; each is a
normal Track 2 item now, shipped through the gate against the live map.

1. **Canvas & navigation** (pan/zoom, pages) — partially have via PixiJS.
2. **Layers** (map / object / GM-hidden / lighting) — foundational; several
   items below assume it.
3. **Drawing tools** (pen, shapes, text, color/opacity) — partially have.
4. **Grid** (square/hex, snap, per-page scale) — see grid tooling above.
5. **Tokens**: art library, resize/rotate, status markers, bars, auras, sheet
   link. Status markers, bars and sheet link already exist.
6. **Measurement** (ruler, movement tracking) — movement tracking exists.
7. **Fog of war / dynamic lighting** — highest complexity and risk; depends on
   the wall-drawing tools. Manual fog of war is the cheaper first step. **Do
   not lead with this.**
8. **Asset / art library + uploads.**

**Sequencing note (carried over):** dynamic lighting is the "wow" but also the
hardest and riskiest — occlusion geometry, wall performance, per-token vision.
The layers + drawing + grid foundation underneath it is lower-risk, higher daily
value, and lighting depends on it. Build the foundation first.

---

## Track 3 — retired (2026-08-12)

**Was:** build a Roll20-caliber, graphics-intensive map as a separate mini-app,
in isolation, designed to import into the live site later.

**Decision: killed. Evolve the live map instead.** Its target feature set moved
into Track 2 under [Roll20 parity](#roll20-parity-inherited-from-track-3).

**Why.** The quarantine that justified a separate app was also its main cost. A
second app only carries "the same automations" if the automation layer is
genuinely shared, which made Track 0 a *hard* prerequisite — so nothing
graphics-rich could ship until an extraction with no user-visible payoff was
finished first. And the isolation that made aggressive iteration safe is the
same thing that kept the results away from real play: a feature is only proven
once a real session uses it. Meanwhile Track 2 kept absorbing the parity list
anyway — PixiJS canvas, drawing, walls, vision, multi-select and cover all
landed on the live map, which is most of tiers 1–6.

**What this costs.** Real, and worth naming: the live map is production, so
every parity feature now pays the gate and there is nowhere to prototype
recklessly. Fog of war and dynamic lighting — tier 7, the riskiest work — have
to land incrementally behind the existing map rather than arriving finished.
That is the accepted trade.

**If this is ever revisited,** the reason to reopen it would be a specific
feature that genuinely cannot be built incrementally against the live map.
Nothing on the parity list currently looks like that.

---

## Track 0 — Shared foundation

**Not a separate goal — enabling work the map depends on.**

**Status note (2026-08-12):** this was a *hard* prerequisite when Track 3
existed, because two separate apps could not otherwise share automation logic.
With one map, it is no longer blocking — but it is still worth doing on its own
merits, and the argument is now about testability rather than code-sharing.

**The decoupling requirement:** the automation/geometry logic should be
**renderer-agnostic** — operating on abstract coordinates + state rather than
reaching into PixiJS. The map becomes a *renderer* on top of an automation core.

- Get this right → automation is unit-testable without a canvas, and the
  rendering layer can be replaced or upgraded without touching rules behavior.
- Get it wrong → geometry logic stays welded to display objects, and the only
  way to test it is to boot a browser.

This is already partly true and trending the right way: `src/rules/` is pure by
construction, and the battle-map decomposition keeps pulling logic out into
testable modules (`battlemap/marqueeGeometry.ts`, `battlemap/coverState.ts`,
`lib/map/coords.ts`). Continue that direction rather than attempting one big
extraction.

> **Practical constraint:** a test that imports a battle-map component passes
> locally and fails in CI. `ci.yml` pins `node-version: 20`, which has no global
> `navigator`; pixi.js reads it at module scope, and Node 21+ locally hides the
> problem. This is the concrete reason to keep pure logic in its own module.

---

## Deferred polish — paid dice cosmetics

**Owner note, 2026-08-25 (Jared):** the paid dice need to be *visually* worth
paying for — **shiny, eye-catching, obviously special** next to the free Classic
set. Right now they are colour swaps with slightly different material settings,
which is not a $2 experience.

**Deliberately deferred until after the launch build-out is complete.** This is
polish on a product that already sells; it is not a launch blocker, and doing it
early would mean re-doing it once the surrounding store work settles. Recorded
here so it survives the launch push rather than living in a chat log.

When it is picked up: the material knobs already exist per skin in
`src/data/diceSkins.ts` (`metalness`, `roughness`, `emissiveMult`, `clearcoat`,
`clearcoatRoughness`, plus per-face `f`/`e` colours), so the lever is the
three.js material treatment, not new plumbing. Worth considering an environment
map for real reflections — the current sets have no environment to be shiny
*against*, which is most of why they read flat.

See `docs/MVP_LAUNCH.md` for the catalogue decision that has to land first: the
store and the dice roller currently ship two different lists of paid dice.

---

## Infrastructure (cross-cutting, supports all tracks)

Deferred items that make the daily loop real:
- **Keep-warm cron** — prevent Supabase auto-pause (has caused 2 outages). The one
  genuinely daily-scheduled, fully-safe-to-run-unattended task. Highest priority.
- **Frontend resilience** — bounded timeout + retry on session restore, replacing
  the infinite "Loading…" spinner when auth is unreachable.
- **GitHub Actions CI gate** — encode the gate (tsc ≤ `TS_BASELINE` in ci.yml / TS2304 = 0, hooks
  clean, build) on every push. Regressions can't reach prod.
- **RAW regression suite** — the Track 1 detection layer; runs daily, opens issues
  on drift, never edits.

---

## Cadence

- **Track 1:** gated sessions when real RAW work exists.
- **Track 2:** daily default — small, visible, gated ships. Bigger parity items
  (layers, fog of war) get dedicated deeper sessions, but still ship
  incrementally through the gate — there is no isolated sandbox any more.
- **Infra:** slot in as capacity allows; keep-warm cron first.

The daily continuous-improvement loop (once infra lands): keep-warm ping fires →
RAW regression suite runs and posts status → drift opens an issue with specifics.
Human involvement drops to skimming status and doing the irreducible RAW judgment
calls in gated sessions.

### Mind Sliver timing foundation (not connected to live combat yet)

`src/rules/mindSliver.ts` plans one-use penalty consumption and caster-owned
end-of-next-turn expiry. It separates expired records from consumed records,
rejects missing/ambiguous/stale clocks, and isolates encounters and targets.
Overlapping instances produce one d4 penalty. Consuming all active instances
on that save follows the interpretation that each instance refers to the same
next saving throw; this is distinct from adding their penalties together.

Sources: [licensed 2024 spell reference](https://roll20.net/compendium/dnd5e/Spells%3AMind%20Sliver?expansion=32231&iframe=true)
and [2024 combining spell effects](https://www.dndbeyond.com/sources/dnd/br-2024/spells).
No spell prose was copied into the planner. These tests establish the domain
contract only; Mind Sliver's secondary effect remains unautomated in the app.

Next integration must extend the existing turn observer (not add an independent
clock), persist the spell's casting-time context, and attach the effect only
after the failed save is final, including any Legendary Resistance decision.
Save settlement must lock/consume applicable records together with the result
and return the original receipt on retries. Spell saves, Propel/class saves,
concentration, and sheet/death saves must use that same consumption boundary.
Damage-triggered concentration must see the applied effect before it resolves.
Solo/non-encounter duration needs an explicit supported turn boundary too.

Integration evidence: `psionic_turn_starts` currently tracks characters only
with UUID epochs; it has no completed-turn ordinal. The planner's ordinal
inputs therefore require a verified adapter/extension, not invented client
round arithmetic. Non-character casters also need coverage. `advanceTurn`
currently runs end-of-turn ticks before advancing initiative, so their saves
must settle before the outgoing caster's effect expires. Existing buff sweeps
run at turn start and cannot express this boundary correctly.

Verification: 23 focused timing/consumption cases and changed-file lint pass;
full project verification passes with TypeScript 197/197 and 255.2 KB entry.
No runtime or UI behavior changed in this foundation checkpoint.

### Mind Sliver saved-turn adapter (local only)

`20261009201350_next_save_turn_context.sql` derives the planner's caster
ordinals from existing `combat_clock_transitions` receipts. It creates no
second initiative clock and works for character and creature participants.
A +1 offset handles the initial actor and casts before a caster's first turn.
Callers capture `castTurnOrdinal` and `turnId` at casting; later reads pass
that saved turn ID and use `lastEndedTurnOrdinal` for expiry.

The private helper checks that the active actor matches the last saved turn,
rejects disconnected history/manual jumps, and rejects a saved casting turn
absent from that history. The first-receipt case is checked too. It is not an
authenticated endpoint; a future authorized effect transaction must call it.
Pending integration remains effect application and atomic save consumption,
including concentration, class features, and standalone saves. No player-facing
automation was enabled by this migration.

Local CLI migration apply encountered the preserved weapon branch's extra
`20261008213500` ledger row. That row was retained. Only this reviewed migration
was applied transactionally to local Docker, with its own ledger entry; the
helper and ledger entry were verified. Nothing was applied to production.

Validation: all 46 desktop/mobile-configured SQL transaction checks pass
(23 cases per configuration), including creature casters and roster drift;
private-schema SQL lint reports no errors. These are database tests, not visual
UI verification. The first fixture used an invalid combatant definition label;
corrected to the existing `custom` storage label with a `creature` participant.
An unrelated damage-dialog unit test timed out during the first concurrent
full-gate run; its isolated 10-test suite passes unchanged. Final full-gate
result is recorded below after rerun.

Final full gate passes unchanged: 3,052 unit tests, TypeScript 197/197,
clean hooks/RAW/coordinates/anchors, successful build and 255.2 KB entry.

### Atomic Legendary Resistance decisions (local branch; not released)

`20261009202011_atomic_legendary_resistance.sql` now settles the DM's choice,
charge usage, final save and accepted-use combat event in one transaction.
Attack locking serializes repeated decisions; participant locking prevents two
different failed saves spending the last charge. Exact retries return the
saved result, conflicting decisions reject, and authorization precedes replay.
Expired/cancelled attacks and exhausted charges cannot become successful saves.
The existing in-lair extra use remains limited to creatures with base uses;
hidden targets produce hidden log events.

`src/lib/api/legendaryResistance.ts` replaces the failed-save flow's independent
client writes. The prompt catches failures, displays a retry message and releases
its controls; same-frame clicks cannot race. This is a prerequisite for applying
Mind Sliver only after its final failed-save outcome. Mind Sliver effect creation
and consumption still remain to be connected.

Manual LR spending/reset controls still use legacy writes and need their own
atomic settlement; this change does not claim all resource editing is serialized.
The existing lair-flag reader also needs error handling so failed reads cannot
silently suppress an in-lair extra-use prompt. Local migration applied with its
ledger entry while preserving the other branch's weapon migration. No prod apply.

Validation: 24 local SQL/browser cases pass across desktop and mobile settings,
including a simulated failed request followed by a successful retry; both error
screenshots were inspected. Nine focused API/dialog unit tests pass. Full gate:
3,061 units, TypeScript 197/197, clean hooks/RAW/coordinates/anchors, build and
255.2 KB entry. Private-schema SQL lint is clean. Rollback coverage forces the
receipt insert to fail and verifies charge, save and event all roll back.

### Mind Sliver saved origins and final-save activation (local only)

`20261009202736_mind_sliver_effect_origins.sql` captures a declared Mind Sliver's
canonical spell ID, target and casting-time turn context in a private record.
These records do not depend on the lifetime of pending casts or attacks.
The helper validates Intelligence/zero-slot/no-effect-on-success settings and
uses the existing saved-turn adapter. A display-name match cannot create an
origin; the private spell-payment ID is authoritative.

After a verified delivery, a final failed save changes the waiting origin to
active. A pending Legendary Resistance decision keeps it waiting; acceptance
marks it resisted, while decline activates it. Counterspell, cancellation and
successful saves do not activate it. Resolution after its expiry marks it
expired. Target/context tampering aborts the save write. Delivery must have
its private receipt before any save update can activate an effect.

This is persistent effect lifecycle state, not completed player automation:
active records are not yet consumed by save settlement and no penalty is
added to rolls by this migration. Character-origin declared casts are covered;
other caster and standalone paths still need equivalent trusted origins.
The next change must consume these records atomically with the first eligible
save, including concentration caused by the same spell's damage.

An `active` record is not itself proof of current eligibility: the eventual
consumption transaction must re-read caster turn context and expire stale
records before rolling. This migration detects late initial resolution, but
does not run a separate turn sweep. Existing records therefore remain dormant
until that consumer is implemented; no UI should present them as an applied
penalty merely from the stored status.

Verification: 26 focused Mind Sliver SQL cases pass across desktop/mobile
configurations (22 lifecycle cases, then four real atomic-resistance cases
rerun after correcting the creature fixture's definition link). Two actual
Teleporter-picker browser cases confirm a saved waiting origin for the chosen
target. The broader 62-case delivery suite passed before adding the stricter
receipt guard; the final focused runs cover that guard. Full project gate
passes: 3,061 units, TypeScript 197/197, build and 255.2 KB entry. SQL lint and
changed-test lint pass. An ambiguous SQL column reference exposed by execution
was corrected before these final runs. Local-only migration; not deployed.

### Shared next-save penalty consumption (local only; not wired to save RPCs)

`20261009203825_next_save_penalty_consumption.sql` adds a private transaction
component for attack, concentration, feature, sheet and death saves. Every kind
locks the same target participant, rechecks caster-owned expiry and records an
immutable request/result receipt. Overlapping Mind Sliver records are consumed
together for one d4; expired or already-consumed records contribute nothing.
Automatic failures consume the next-save trigger without generating a die.
The helper accepts a saved canonical-dice proposal; it generates no SQL dice.

Exact retries replay the same receipt, including after combat ends. Changed
dice/context reject. The helper cannot apply a spell's effect to its own
original save. If the enclosing save transaction fails, consumption and its
receipt roll back too. Mind Sliver activation now takes the same participant
lock, ordering a newly activated effect relative to concurrent saves.

There is no standalone public consumption endpoint. Authorized save settlement
RPCs still need to call this component and include its penalty in their result;
client handlers must save the proposed die and display the returned receipt.
Until those callers are connected, player rolls remain unchanged. This helper
alone does not prove all save paths or automatic-failure handling are complete.

Validation: 24 focused SQL cases pass across both test configurations, plus two
integration cases consuming a real declared Mind Sliver effect after pending
cast/attack pruning. Full gate passes (3,061 units, TypeScript 197/197, clean
hooks/RAW/coordinates/anchors, build and 255.2 KB entry); SQL and changed-test
lint pass. Applied to local Docker with its ledger entry; no production apply.

### Concentration now consumes Mind Sliver (local branch; release still gated)

`20261009204354_concentration_next_save_penalty.sql` connects the shared penalty
transaction to campaign concentration settlement. It selects the advantage die,
subtracts the saved d4 once, then decides concentration and cleans up owned
spell effects in the same transaction. The resulting penalty receipt is saved
on the offer, returned on replay and included in the combat log. Obsolete
casting offers consume nothing; failed settlement rolls the penalty back.

The public RPC retains its name and older arguments with an optional penalty
die. Legacy clients can resolve ordinary saves, but a live penalty requires
the missing die before any write commits. The old private signature forwards
to the new implementation, so it cannot bypass consumption. A pending effect
with an unverifiable/inactive encounter still requires review rather than
silently disappearing. Between-encounter offers without effects retain their
existing behavior.

The client stores its d4 proposal alongside the original d20/advantage pair,
validates returned penalty receipts and preserves them through lost responses.
The concentration result names Mind Sliver's deduction. This is only the
concentration connection: ordinary attack saves, class saves, sheet/death saves
still need the same boundary. Do not release the combined Mind Sliver feature
while another save could happen first and leave its penalty unconsumed.

Visual verification found and fixed a pre-existing misleading toast: every
external concentration clear was labeled timer expiry. Realtime only reports
the clear, so it now gives a neutral loss notice; actual timer-button expiry
retains its specific reason. Desktop/mobile screenshots confirm the penalty
result text and corrected toast, with no horizontal page overflow.

Validation so far: 80 existing/new SQL and recovery cases pass in the broad
run; its two new advantage fixtures were corrected to create a real War Caster
offer rather than alter an immutable snapshot, and both pass on rerun. Two new
player-facing penalty cases pass, including the final toast correction. All
32 concentration API unit cases pass, including saved d4/retry and malformed
receipt handling. Private-schema SQL lint passes. These checks do not yet
prove the complete Mind Sliver damage-to-concentration chain end to end or
penalty consumption by other save kinds; those remain release requirements.

Final full gate after the toast fix passes: 3,067 unit tests, TypeScript
197/197, hooks/RAW/coordinates/anchors, build and 255.2 KB entry. Migration
applied to local Docker with its ledger entry; no production deployment.

### Preserve lair-only resistance on failed reads (unreleased)

Lair reads now live behind the resistance repository and reject query errors,
missing encounters and malformed flags. A failed creature save cannot silently
skip its final in-lair resistance charge when that setting is unavailable.
No-encounter callers still receive zero bonus. Manual resistance controls surface
failures through the existing error toast instead of an unhandled rejection.

Regression coverage includes rejected/stale/malformed reads, no save write or
combat event after a failed lookup, and manual-control error reporting. The
actual desktop/mobile save flow now starts with only the lair charge remaining:
a forced read failure records no result, then a successful retry offers and
spends that last charge atomically. Both browser cases pass; the mobile retry
screenshot confirms the 1/4 in-lair display and visible retry message. Browser
fault injection blocks service workers so requests reach the test interceptor.

This is a prerequisite for ordinary-save penalty settlement, not its completion.
Ordinary saves still need persisted dice and atomic settlement; retrying an
unrecorded save can currently reroll. Manual resistance spending/reset remains
non-atomic. Mind Sliver's other save consumers remain release requirements.

Final gate passes: 3,081 unit tests, TypeScript 197/197, hooks/RAW/coordinates/anchors, build and 255.2 KB entry. No new migration or production deployment.

### Atomic ordinary-save settlement (local backend; client wiring pending)

`20261009210500_atomic_attack_saves.sql` adds DM-authorized context and settlement
RPCs. One transaction chooses the appropriate d20, applies cover/exhaustion and
the submitted DM modifiers, consumes Mind Sliver, determines Legendary
Resistance, saves the result and writes combat history. Failures roll everything
back. Different saves serialize on their target; only the first qualifying save
can consume a given next-save effect. No SQL dice generator was introduced.

The context records target identity, conditions, buffs, exhaustion, house rule
and active Psionic Guards. Changes reject a stale submission. Buff identities
must match the current snapshot and contribution totals must add up; the DM's
base modifier and individual buff results remain submitted inputs, as in the
existing DM-controlled flow. Automatic failures use no dice and still consume
the next-save trigger. Save/cover/buff history preserves hidden-target visibility.

Replay keeps the winning dice and penalty but returns the current attack row,
so a subsequent Legendary Resistance decision is not overwritten by the older
failed-save receipt. Authorization is checked before replay. The receipt table
and raw helper functions have no direct authenticated access.

Validation: 46 database cases pass across the two configured test projects,
plus two focused cases using a real Psionic Guards activation. They cover
penalty outcomes, lair resistance, automatic failure, disadvantage, cover,
exhaustion, house rules, stale context, unauthorized access, competing retries,
competing saves, rollback, invalid dice, hidden logs, post-combat replay and
condition-table parity. These are SQL integration cases, not UI checks. Full
gate passes (3,081 units, TypeScript 197/197, hooks/RAW/coordinates/anchors,
build and 255.2 KB entry). Private-schema SQL lint and test lint pass.

Applied only to local Docker with its migration ledger entry. The browser's
`rollSave` still uses its legacy path. Next: replace that path with saved client
dice proposals and receipt validation, render the penalty, preserve Counterspell
settlement, and block legacy writes from bypassing the new boundary. Then verify
the actual spell/save UI, including lost responses and stale settings. This
backend alone is not releasable Mind Sliver automation; other save consumers and
the full damage-to-concentration chain are still pending.

### Ordinary save controls use the transaction (unreleased)

`rollSave` now delegates to `src/lib/api/attackSaves.ts`; the old separate
save/Legendary Resistance/event writes were removed. The client saves its d20
pool, buff rolls, penalty proposal and context before settlement. Failed or
unverifiable responses retain that proposal; concurrent clicks share one
request. Successful confirmation removes it. A recorded result still retries
Counterspell settlement without rolling again.

The recovery panel shows saved dice and bonus. Changing a bonus requires an
explicit settings review, then a separate confirmation. Reviews preserve
compatible dice and retain temporarily unused dice (including the penalty die),
adding only newly required dice. Failed reads keep the previous proposal.
Corrupt storage refuses a replacement roll. The result banner names Mind
Sliver's deduction and separates it from the ordinary modifier in its equation.

`20261009213000_guard_attack_save_writes.sql` blocks direct browser inserts of
resolved saves and updates to save result/dice/penalty/resistance-decision
fields. Invoker trigger security allows the authorized definer transactions to
perform those writes. Old browser bundles receive a reload instruction instead
of bypassing effect consumption. Applied to local Docker only, with ledger row.

Validation: the 48 ordinary-save SQL cases still pass with the guard installed;
four additional SQL cases reject legacy inserts/updates. Desktop/mobile UI
checks exercise failed settings reads, failed settlement, reload recovery,
explicit bonus review, a committed save whose response is lost, one penalty/log
entry, and the last lair resistance charge. A fixture alert selector was narrowed
after lost-response coverage legitimately produced multiple alerts; both final
UI cases pass. Screenshots inspected; recovery panel stays within the modal.
Fifteen API tests cover stored proposals, concurrent clicks, changed settings,
blocked/corrupt storage, module reload, malformed receipts and competing winners.
Three recovery-control tests and save/Counterspell delegation tests pass.

Final full gate: 3,082 units, TypeScript 197/197, hooks/RAW/coordinates/anchors,
build and 255.2 KB entry. Old client-only save math tests were replaced by the
real SQL and delegation coverage. Public/private SQL lint reports no errors;
changed-file lint has warnings only. No deployment yet: class/Propel, sheet,
death, creature/standalone origins and full declared-spell damage-to-concentration
coverage still need completion before Mind Sliver can be called complete.

### Class-save condition evidence corrected (unreleased)

The remaining feature-save audit found that the class resolver only applied
Psionic Guards Advantage. It now applies the existing condition table's automatic
failure and Disadvantage flags too. No dice are generated for an automatic
failure; a Disadvantage roll keeps the lower die. Logs distinguish a condition
failure from a willing failure. Automatic failures no longer show a misleading
numerical roll badge. Manual outcome buttons retain the original rule flags.

Propel's evidence contract and server validator now support optional
`disadvantage` and `automaticFailure` fields, preserve legacy records, and verify
die count, kept face and forced outcome. Opposing Advantage/Disadvantage cancels
to one die. The migration is
`20261009215000_propel_condition_save_evidence.sql`, applied only to local Docker
with a ledger entry. A bad kept face or invented automatic-failure die rejects
before the conditional Energy Die cost or history commits.

Unit coverage checks the new evidence contract and actual class resolver.
Desktop/mobile Propel tests cover normal, Paralyzed and Encumbered targets,
including a 20/1 Disadvantage pair and a Paralyzed target with a +30 bonus.
The powered use still spends exactly one Energy Die on failure. Negative server
submissions preserve both the pool and unresolved declaration. Six initial UI
cases pass, four stronger condition/validation cases pass, and two final
Paralyzed cases pass after removing the cosmetic badge and log arithmetic.
Screenshots inspected on desktop/mobile. SQL lint and changed-test lint pass.

Still incomplete: feature conditions are read from the modal's participant
snapshot, not revalidated at resource settlement. This correction does not yet
consume Mind Sliver for class saves. Next work must connect an authoritative
feature-save transaction, preserve retries, and apply the penalty before deciding
Propel's conditional cost. General feature buff/exhaustion handling also needs
review. No production deployment of this branch.

Final full gate passes: 3,087 unit tests, TypeScript 197/197, hooks/RAW/coordinates/anchors, build and 255.2 KB entry.

### Declared Propel refreshes live save conditions (unreleased)

`20261009221000_shared_feature_save_context.sql` extracts the existing ordinary
save target-state reader into one private helper. Ordinary saves preserve their
same context shape. A new scoped Propel read requires the authorized character,
its unresolved finalized declaration, the original active encounter and the
bound target. It returns current conditions, buffs, exhaustion, house-rule
flags and remaining Legendary Resistance (including lair allowance), without
spending resources or changing the declaration. The raw helper is not exposed.

Propel's assisted save now passes its declaration ID into the class resolver
and refreshes that context immediately before rolling. A newly applied condition
therefore takes effect even if the dialog was already open. Read failures leave
the target unresolved and generate no dice. Other class abilities retain their
current modal-snapshot behavior. The API validates identities and state rather
than interpreting a failed read as an empty condition list.

Validation: 74 database/browser cases pass: 16 new context cases, 52 ordinary-save
regressions using the extracted reader, and six desktop/mobile Propel flows.
The Paralyzed browser case applies the condition after opening the dialog and
still produces a no-dice failure. Fifteen API validation cases and two added
class-control tests pass. Full gate: 3,104 units, TypeScript 197/197,
hooks/RAW/coordinates/anchors, build and 255.2 KB entry. SQL lint passes.
Applied only to local Docker, with migration ledger entry; branch not deployed.

This read is not settlement authorization. Next: preserve the submitted context
and dice, recheck/lock the target at settlement, consume Mind Sliver, and derive
the final result before paying Propel's conditional cost. Legendary Resistance
needs a DM decision before finalizing a failed feature save. Buff/exhaustion
values are returned for that transaction but are not newly applied by this
change. Full feature/standalone/death-save coverage remains a release gate.


### Propel settlement rechecks condition evidence (unreleased)

`20261009224000_propel_settlement_condition_guard.sql` now checks assisted
Propel save evidence inside the same transaction as conditional Energy Die
payment. It locks the encounter, participant and combatant state, then compares
current automatic-failure, advantage/disadvantage and natural-extremes flags
against the submitted roll. Changed flags, missing targets and ended encounters
reject before payment or history writes. Completed receipt replays bypass fresh
eligibility checks and never charge again. Explicit manual/tabletop outcomes
remain adjudicated outcomes rather than fabricated rolls.

The target character is locked before encounter/participant rows. Simultaneous
cross-character resolutions can encounter PostgreSQL deadlock detection; that
transaction rolls back rather than committing a partial cost and can be retried.
This does not yet make every save input authoritative: buff/exhaustion arithmetic,
Mind Sliver consumption, Legendary Resistance decisions, target replacement
identity at declaration, and persistent dice review after stale-context rejection
remain open. Do not deploy the combined branch as complete feature-save support.

Validation: focused database regressions cover changed/removed automatic failure,
new disadvantage, ended encounters, zero rejected-use cost/history, successful
retry, and receipt replay after conditions change. Migration applied only to local
Docker with its ledger entry; unrelated preserved migration history unchanged.

Final checks: 12 focused SQL cases passed, including an actual concurrent
condition update held open while settlement waits. All 16 browser scenarios
pass across desktop/mobile (12 unaffected cases in the initial run; four
Teleporter cases rerun after repairing an out-of-scope variable in their test
fixture). Required gate: 3,104 unit tests, TypeScript 197/197, hooks, RAW,
coordinates, anchors, build and 255.2 KB entry. Private SQL lint has zero errors;
existing warning-level findings remain. Changed test files pass ESLint.


### Propel penalty and resistance transaction (unreleased backend)

`20261009231000_propel_save_settlement.sql` adds a scoped, persistent save receipt
for a declared combat Propel. `settle_propel_save` authorizes the character owner
or campaign DM, locks current target state, rejects stale context, validates dice
and buff contribution identity/totals, applies exhaustion and the shared Mind
Sliver consumer, and calculates the actual result. With no resistance decision,
the receipt, next-save consumption, conditional Energy Die cost and history
commit together. Any payment failure rolls the whole operation back. Competing
submissions return the winning dice, not a replacement roll.

A penalized failure with remaining Legendary Resistance commits its save and
consumed next-save effect, then waits without spending an Energy Die. The DM-only
`decide_propel_resistance` validates the original target, active encounter and
current charges (including lair allowance). Accepting spends one resistance and
finishes passed with no Energy Die; declining finishes failed with its conditional
cost. Decision, charge and completion share a transaction. Replays are idempotent;
a conflicting repeat is rejected. Later conditions do not change a recorded save.
Legacy manual finish/cancel cannot bypass a pending decision.

The immutable receipt retains original failed dice and penalty even when
resistance changes the final outcome. Accepted resistance stores no fabricated
passed roll in the legacy `save_details`; the new receipt is the detailed source.
`get_propel_save` provides owner/DM recovery. Raw tables/helpers stay private.

Remaining integration: wire the new API into Propel controls with persisted dice,
explicit stale-context review, penalty presentation and a recoverable DM decision.
Existing controls still use the older save route; this backend is not advertised
as player-facing support yet. Submitted base bonus and DC remain reviewed inputs
(the client must derive DC from the declaration snapshot); buff dice expression
arithmetic is not fully server-derived. Feature/standalone/death coverage and full
declared Mind Sliver-to-damage-to-concentration testing remain release gates.
Migration applied only to local Docker, preserving unrelated ledger entries.

Validation: 35 focused checks pass: 20 new transaction cases, 12 prior context/
condition regressions, and three desktop browser save flows. They include
concurrent roll submissions and resistance decisions, owner/outsider permissions,
penalty-driven failure, lair-only resistance, automatic failure, buff/exhaustion
arithmetic, stale inputs and payment rollback. The first run exposed only a test
reader parsing SQL NULL as empty JSON; corrected and all cases passed. Full gate:
3,104 unit tests, TypeScript 197/197, hooks, RAW, coordinates, anchors, build and
255.2 KB entry. Changed test lint and private SQL error-level lint pass.


### Propel save controls use the transaction (unreleased)

The real Propel controls now open `PropelSaveControls`, using `propelSaves.ts`
for durable dice preparation, confirmation and resistance decisions. The target
is fixed to the declaration; DC comes from its character snapshot. The reviewed
base bonus is separate from active buffs, exhaustion and Mind Sliver. Recorded
penalties and final Energy Die costs are shown, and automatic failures do not
invent a displayed d20. Combat passed/failed shortcut buttons are removed from
this view; solo/tabletop manual outcomes remain available.

Proposals persist before confirmation. Explicit context review keeps compatible
d20/buff/penalty dice and adds only newly required rolls. Invalid receipts,
blocked storage and network errors do not silently replace a throw. Concurrent
confirmations share the operation; conflicting decisions are rejected. The
owner can recover a waiting receipt, while only the campaign DM sees resistance
buttons and the server enforces that permission. Accepted resistance preserves
the failed roll while explaining the final success and zero Energy Die cost.

Completed saves are absent from the server's unfinished list. The launcher now
also lists browser proposals with unconfirmed responses, so a reload after a
lost successful response can recover that completed receipt. Verified receipt
reads clear the browser proposal. New declarations wait while one needs review.

Validation includes lost responses on both transport attempts, reload before
confirmation, reload while waiting for resistance, reload after completed
payment, explicit bonus review preserving dice, and both resistance choices on
desktop/mobile. Screenshots were inspected for saved-dice, waiting and final
states; the modal-scoped standard overflow probe (including fixed ancestors)
passes in the resistance scenarios. Fault injection seeds the active Mind Sliver
effect; full declared-spell-to-save integration remains a separate release gate.

Still open: old clients/direct legacy completion can bypass a new receipt when
none exists (the server blocks bypass once a receipt is pending); unsupported
save consumers/origins, manual LR writes, and DM discovery outside opening this
character's saved use. The combined branch is not deployed. Do not call all
Psion or Mind Sliver automation complete based on these focused checks.

Final gate: 3,126 unit tests, TypeScript 197/197, hooks, RAW, coordinates,
anchors, build and 255.2 KB entry. Twenty-two new API recovery/validation tests
pass. Ten desktop/mobile save scenarios pass: six condition/completed-recovery
cases and four pending-resistance/lost-response cases. Changed-file ESLint and
diff whitespace checks pass. No production migration or deployment performed.


### Combat Propel cannot bypass its recorded save (unreleased)

`20261010000500_require_recorded_propel_saves.sql` closes the legacy completion
path for unresolved combat declarations. Direct passed/failed submissions,
including otherwise plausible rolled details, require the private save receipt.
The modern settlement transaction supplies that receipt before payment. An old
client receives a reload/Resolve combat save instruction instead of silently
skipping Mind Sliver or Legendary Resistance. Existing completed receipts replay
without retroactive saves or extra costs. Pre-save cancellation and solo/tabletop
manual outcomes retain their prior behavior.

The save-evidence, history rollback, concurrency and stale-context regressions
now use the modern public transaction. Private payment-helper tests still test
that internal primitive; its lack of authenticated/anonymous execute permission
remains asserted. New regressions cover both forged outcomes with live Mind
Sliver and resistance, unchanged effect/resources/history after rejection,
subsequent modern resolution, cancellation, old completed receipts, and solo
manual resolution. Local Docker only; unrelated migration ledger preserved.

Next-save coverage inventory, traced to live importers: end-of-turn condition
saves run from `combatEncounter.ts` through `endOfTurnConditions.ts` and currently
roll/remove effects in separate client calls. Death saves have three writers:
automatic turn-start in `combatEncounter.ts`, prompted saves through
`deathSaves.ts`/`DeathSavePromptModal`, and sheet `DeathSaves.tsx`. These all need
shared authoritative save/penalty handling; no pure death-save domain module
currently unifies their outcome math. Other class, sheet and standalone save
consumers/origins remain open. This branch is still not a complete Mind Sliver
release and has not been deployed.

Source check for the next integration: [2024 Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game#DeathSavingThrows)
confirms death saves are not tied to an ability score; stabilization resets both
counters, and natural 1/20 have their specific death-save effects. Current client
writers do not consistently reset both counters on stabilization. The same
source's Saving Throws section permits choosing failure without rolling: that
option must return through an explicit authorized resolution path, not the old
combat completion bypass. The new combat Propel dialog does not yet offer it.
These are concrete accuracy items, not claims of completed support.

Verification: all 101 database regressions pass (76 action/Propel/context cases
and 25 settlement/compatibility cases). Full gate passes: 3,126 unit tests,
TypeScript 197/197, hooks, RAW, coordinates, anchors, build and 255.2 KB entry.
Private SQL error-level lint, changed-test ESLint and diff whitespace checks pass.

### Combat Propel: choosing failure without a roll (unreleased)

The combat save dialog now offers DM-confirmed voluntary failure. The choice is
saved before confirmation and survives reload or a lost response. The caster
cannot choose failure on another creature's behalf. Target-player self-approval
is not implemented; this is an explicit DM adjudication path.

`20261010003500_propel_chosen_failure.sql` records the no-roll result and consumes
any next-save trigger without inventing a d20 or penalty d4. Legendary Resistance
still requires its separate DM decision. Conditional energy payment, final outcome
and history retain transaction/replay protection. An existing rolled save cannot
be replaced by choosing failure, or vice versa. Stale context requires review.

Verified locally: 34 database settlement cases, 27 API tests, and 12 desktop/mobile
save/recovery scenarios. Screenshots inspected at both sizes; modal overflow checks
pass. Full gate: 3,131 unit tests, TypeScript 197/197, hooks, RAW, coordinates,
anchors, production build and 255.2 KB entry. SQL error-level lint, changed-file
ESLint and whitespace checks pass. Local migration applied without changing the
unrelated ledger entry. No production migration or deployment performed.

Next: unify death-save outcome math and reset both counters on stabilization;
then integrate the remaining save consumers before releasing the combined
Mind Sliver work. The coverage limitations documented above remain open.

### Death-save audit in progress — do not release yet

A shared `src/rules/deathSaves.ts` resolver now distinguishes the natural d20
from the modified total and resets both counters on stabilization. The two
combat writers are provisionally wired to it. Nineteen boundary/regression cases
cover stabilization, natural 1/20, modified totals and invalid input; the full
verification gate passes. These working-tree changes are NOT release-ready.

Integration review found a persistence dependency that tests did not cover:
`characters` has no stable flag. `CharacterSheet/DeathSaves.tsx` uses three
successes as its stable marker, while `combatEncounter.ts` endEncounter copies
combat counters and intentionally omits combatants.is_stable. Clearing the
combat counters alone therefore loses the stable state on return to the sheet.
Complete explicit character stable-state storage, sheet rendering/manual changes,
combat carry-over, combatant creation, healing/damage/rest resets and realtime
fields before committing/releasing this integration. The prompted save also
needs a fresh dying-state check and atomic settlement; its existing multi-write
path must not be described as retry-safe. Next-save penalties remain unwired here.

Authoritative rules checked again: [2024 Death Saving Throws](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game#DeathSavingThrows).
A stable creature stays at zero HP; both counters reset. Natural 20 restores
one HP, natural 1 adds two failures, and ordinary outcomes use DC 10.

Stable-state integration update: `20261010011000_character_stable_state.sql`
adds `characters.is_stable`, backfills the prior three-success marker, normalizes
healing/third-success/damage-counter writes, and seeds new combatant life state.
The sheet now uses the shared resolver and explicit state; realtime and end-of-
combat carry-over include it. Seven local database cases and desktop/mobile
reload-and-heal scenarios pass. Screenshots inspected. The existing mobile
floating history/dice controls crowd the stable panel's lower-right edge; retain
this as a map/sheet interface follow-up. Four component roll/render cases and
an explicit stable combat-handoff case pass. Full gate passed with 3,151 tests
before those five additional tests, which passed separately; TypeScript197/197,
entry255.2KB. New-file lint passes.

Still uncommitted/unreleased: audit atomic damage context snapshots for the new
field, existing/reused combatants, direct healing/rest paths and stale pending
saves before calling this integration complete. The normalizer alone is not an
atomic death-save settlement and does not consume next-save effects. Local
migration applied; production untouched.

### Stable-state foundation verified (unreleased)

Supersedes the uncommitted status above: the shared death-save resolver, explicit
character stable field, sheet use, realtime carry-over, new-combatant seeding and
combat-end handoff are ready to commit. Damage snapshots now include is_stable;
a stale preview is rejected before damage applies. Obsolete pending prompts
expire without rolling after healing, stabilization or death. This check precedes
the existing writes; it is not a transaction/concurrency guarantee.

Verification: full gate passes with 3,161 unit tests, TypeScript197/197, hooks,
RAW, coordinates, anchors, build and255.2KB entry. All43 local stable/party-damage/
pending-damage-life cases pass, including critical damage and zero damage.
Desktop/mobile sheet reload-and-heal checks and screenshots passed in the prior
step. SQL error-level lint returns no errors; new-file lint is clean after replacing
the test builder's any. The five stale-prompt tests were rerun after that type-only
cleanup. Local migration/ledger updated; no production changes.

Remaining death-save work: atomic resolution and next-save-effect consumption;
live synchronization between a sheet and an already-existing combatant; and
pending-prompt roll receipts/history. Reusing a combatant preserves its combat
life state instead of reinitializing it from the sheet, as before. Broader healing,
rest and simultaneous-update behavior must be covered by that next integration.
Do not interpret these tests as complete Mind Sliver or death-save automation.

### Atomic prompted death-save backend (unreleased; UI not yet connected)

`20261010021000_atomic_prompted_death_saves.sql` adds an owner/DM-authorized
context reader and settlement RPC. Character/prompt/encounter/participant/
combatant locks protect the result. A private per-prompt receipt returns the
original outcome on retry. Save result, shared next-save penalty consumption,
combatant and character life state, pending status and combat event commit or
roll back together. Natural faces retain death-save rules independently of the
modified total; exhaustion applies to the total. Natural20 removes Unconscious
from both records. Obsolete healed/stable/dead/inactive-encounter prompts expire
without consuming an effect or producing a rolled event. Changed context or
identity is rejected; private receipt storage is inaccessible to authenticated
clients. Local migration applied, production untouched.

All19 database cases pass after final identity checks: permissions, concurrent
replay, stabilization, natural extremes, advantage/disadvantage, exhaustion,
stale/obsolete state, actual seeded Mind Sliver consumption and rollback.
Full gate passed (3,161 unit tests, TypeScript197/197, hooks, RAW, coordinates,
anchors, build,255.2KB entry). SQL error-level lint and new-test ESLint pass.

Not a released feature: the current dialog/automatic/sheet writers still use
legacy paths. Next connect persisted dice proposals, explicit effect-modifier
review and result recovery to the new transaction, then block bypass writes.
Bonus/advantage inputs currently represent reviewed effects; they are not
server-derived from all equipment/feature sources. Prevent duplicate prompt
creation for the same turn, cover stale prompts across a revived-then-downed
life cycle, and add full actual spell-delivery end-to-end evidence. The seeded
Mind Sliver tests prove consumption, not its complete casting/damage pipeline.

### Player death-save dialog uses atomic settlement (unreleased)

The live `DeathSavePromptModal` now uses `api/deathSaves.ts`. It persists the d20
pool, proposed penalty d4, effect modifier and reviewed context before confirmation.
Reload and transport failure preserve dice; compatible context review never
rerolls existing faces. A second die is added only when advantage/disadvantage
requires one, and retained if settings later change. Local proposals remain
listed even when the server has already resolved the offer, allowing recovery
of a lost acknowledgement. Receipt identity/arithmetic/penalty checks precede
removing the proposal. Concurrent confirmation clicks share one request.

The superseded client multi-write resolver and its five obsolete tests were
removed. Eleven API tests now cover persistence, failed/repeated confirmation,
settings review, storage failure, corrupt data, invalid receipts and discovery.
Desktop/mobile browser tests commit a save, lose its response deliberately,
reload twice and confirm the same result with exactly one combat event. Both
pass. Updated screenshots inspected; the standard overflow probe, scoped to the
modal with fixed-ancestor skipping disabled, reports no clipping or sideways
scroll. Checkboxes now align beside their labels on mobile.

Limits remain explicit: effect bonuses/advantage are reviewed inputs, with active
buffs listed; their dice are not automatically derived yet. Exhaustion and Mind
Sliver are applied by the server. Automatic turn-start and direct sheet rolls
still need migration to this path before legacy writes can be blocked. Duplicate
prompt prevention and revived-then-downed prompt identity remain follow-ups.
Nothing in this branch has been deployed to production.

Final player-flow gate: 3,167 unit tests, TypeScript197/197, hooks, RAW,
coordinates, anchors, production build and255.2KB entry all pass. Changed-file
ESLint and diff whitespace checks pass. Two browser scenarios passed with the
final layout and overflow probe enabled. No new database migration in this batch.

### Death-save offer identity and duplicate prevention (unreleased)

`20261010032000_death_save_offer_identity.sql` adds a turn token and combatant
life-state revision to each new offer. Revision advances when zero-HP/stable/dead
state changes and cannot be manually rewound. Creation locks character, encounter,
participant and combatant, verifies owner/DM and the actual current actor, and
returns one offer per participant/turn even after it is resolved. A new turn
expires an older pending offer. Settlement expires offers from another turn or
from before healing/stabilization followed by a new downing; it consumes no save
penalty for those obsolete offers. Old unbound pending offers are expired at
migration time instead of being attached to an unverifiable dying episode.

Authenticated direct offer insert/update/delete is revoked. The current prompt
creation caller uses the authorized RPC and passes the exact token returned by
its turn update. The existing schema type now includes psionic_turn_id.

Verification:10 new database cases pass (creation races, permission boundaries,
resolved-offer replay, turn changes, heal/down and stable/damage cycles, revision
rewind rejection, and healthy actors). Existing40 death-save database/browser
cases pass under the migration. Four API caller tests cover the exact observed
token, no-offer result, target mismatch and propagated errors. Full gate passes
with TypeScript197/197 and255.2KB entry; SQL error-level lint and changed-file
ESLint pass. Migration applied only locally.

Important integration finding: live callers still import advanceTurn from
combatEncounter.ts, whose turn write/round clock/buff decrement remain the legacy
client sequence. The existing commitCombatClock API has no live importer. Thus
caster-owned next-save expiry cannot yet rely on all live transitions being in
the atomic ledger. Wire the actual turn path (including recovery ordering) before
claiming complete Mind Sliver expiration. Automatic death saves also still use
the legacy direct writer; this batch protects prompted offer identity only.

### Durable combat-clock recovery record (unreleased; caller integration pending)

`api/combatTransitionRecovery.ts` persists a user/encounter-scoped exact request
before confirmation and retains a validated clock receipt. It distinguishes
clock-pending, clock-confirmed and effects-started. It refuses to replace an
unfinished transition, coalesces in-process confirmations, preserves the original
request after transport/storage failure, and requires explicit post-effect
completion before clearing recovery. An effects-started record is an uncertain
outcome requiring reconciliation; it is never treated as permission to rerun
effects. Receipt validation is shared with combatClock.ts. This is a browser
journal, not a cross-tab server lease or proof that external effects completed.

Eleven new recovery tests and21 existing clock tests pass. Live advanceTurn is
not wired yet: doing that without restructuring its surrounding effects would
repeat or skip gameplay on retries. The current function runs outgoing condition
resaves, end-turn ticks, end-turn auras and movement-feature recovery before
resetting incoming budgets/recharge/mastery state. After its clock write it also
increments campaign rounds and decrements buff durations (both must be removed
when the atomic clock owns them), then emits lair/recharge/refill events, handles
death saves, runs start-turn ticks and emits turn-boundary events.

Next integration must give those effects durable identities/receipts and resume
them in order. In particular the automatic death-save writer cannot be replayed;
it must use the new per-turn offer and atomic save path. Do not clear a saved
clock request merely because its position was acknowledged. No user-visible
turn behavior changed in this foundation batch; production remains untouched.

Recovery-foundation final gate:3,182 unit tests, TypeScript197/197, hooks, RAW,
coordinates, anchors, build and255.2KB entry pass. Changed-file ESLint and diff
whitespace checks pass. No schema/UI change in this batch.


### Automatic turn-start death saves share saved settlement (unreleased)

The live advanceTurn automatic death-save branch now creates the same unique
per-turn offer as prompted saves and settles through the atomic save transaction.
Combat buff saveBonus dice and equipped/attuned item save bonuses are captured
before settlement; exhaustion and next-save penalties remain transaction-owned.
Retries reuse persisted dice instead of rolling again. Equipment is now part of
the expected context, so changing gear requires review before settlement.
Automatic offers stay out of the manual prompt while running; failed attempts
request owner/DM review and locally saved rolls remain recoverable. The new
migration is applied only to Docker, not production.

Live desktop/mobile tests cover End Turn into a dying character with Bless,
Ring of Protection and exhaustion, as well as prompted-save reload/lost-response
recovery. Database regressions cover automatic-offer identity, review permission,
and stale equipment rejection without any result write. Existing Propel controls
passed alongside the death-save transaction suite:84 desktop/mobile cases plus
4 live death-save dialog/automatic-turn checks. The full gate passed3,191 unit
tests, TypeScript197/197, hooks, RAW, coordinates, anchors, build and255.2KB entry.
SQL error-level lint and diff whitespace checks passed. Changed-file ESLint has
only the existing combatEncounter unused chainId error and standing warnings;
new files have no lint errors.

Remaining release gates: automatic advantage/disadvantage and sheet-level effects
are not comprehensively derived; an interruption before dice persistence combined
with failed review RPC can leave an automatic offer undiscoverable. Add durable
recovery for that window. The live combat clock still needs ordered side-effect
recovery and integration with its server ledger; direct sheet saves and other
save callers still need full next-save penalty coverage. This is an unreleased
checkpoint, not a claim of complete Mind Sliver or flawless Psion automation.


### Interrupted automatic death-save discovery (unreleased)

Server-timed discovery now returns pending automatic offers after60 seconds,
including offers whose creating browser closed before persisting any dice. The
sheet checks every15 seconds and on reconnect as well as realtime. Local saved
dice remain first in the recovery queue; actively running saves in this browser
stay suppressed. A new manual preparation converts automatic mode to prompt,
then reloads context before rolling. Resolution mode is part of the expected
context, so a late automatic request cannot settle after that handoff. An already
committed receipt still wins on replay. The review RPC uses settlement's
character-first lock ordering. A result arriving while the dialog is open now
shows a terminal message and Done instead of trapping the player in an error.

This closes the hidden-offer window noted above. It does not make original
uncommitted dice available on another device: roll proposals remain local to
the originating browser. Settlement remains exactly once per offer, but durable
shared proposals and broader turn-effect recovery remain follow-ups. This new
migration has been applied only locally; production is unchanged. Automatic
advantage/disadvantage derivation and other save callers remain release gaps.


The live browser regression also exposed an early-click bug: before combat loaded,
the sheet could treat End Turn as a local reset. ActionEconomy now disables the
button and guards its handler while combat state is loading. A component test
checks that neither local trackers nor combat/solo turns change until loading
finishes. The browser test retains its normal End Turn click to exercise this
protection instead of hiding the race with an artificial wait.

Recovery final verification:3,196 unit tests, TypeScript197/197, hooks, RAW, coordinates, anchors, production build and255.2KB entry all pass. All28 offer database cases and8 final desktop/mobile dialog cases pass. Changed-file ESLint, SQL error-level lint and diff whitespace checks pass. No production migration or deployment.



### Death-save waking condition lifecycle (unreleased)

The turn audit found that natural20 settlement removed Unconscious by array
filter while leaving its derived Incapacitated source behind. That could keep a
revived Psion unable to act. Atomic death saves now use the existing server
remove_conditions helper independently on locked combatant and character rows.
The sheet's natural20 and Regain1HP controls use its canonical pure counterpart.
Waking removes only the derived incapacity, preserves incapacity required by
Stunned/Paralyzed or an independent effect, and retains Prone with fall provenance.
Stabilization at0HP does not remove unconsciousness. Character's type now includes
its already-persisted condition_sources field; the live read/patch path was traced
and verified to retain it.

Rules checked against official2024 Basic Rules:
https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game
https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/

Validation:3,200 unit tests;54 death-save database/browser cases plus2 stable-sheet
browser cases; TypeScript197/197, hooks, RAW, coordinates, anchors, build and255.2KB
entry all pass. SQL error-level lint and changed-file lint pass. New migration
applied only to Docker; production unchanged.

Turn-recovery audit remains open: live advanceTurn separately runs condition
resaves, buff ticks, auras, movement-feature recovery, incoming budgets/recharge,
mastery/once-per-turn sweeps and logs. End-of-turn condition resaves still roll,
log, remove the condition and grant immunity in separate steps, and do not yet
consume Mind Sliver. processTurnTicks also uses a multi-write client path. Those
need durable effect identities and atomic outcomes before the clock journal can
safely resume the complete sequence. The legacy clock has not been switched.


### Atomic turn-end condition save foundation (unreleased; not wired live)

New get_condition_turn_save_context / settle_condition_turn_save RPCs validate
owner/DM access, current actor/turn, active parent condition and its saved ability/DC.
The shared saving_target_context supplies condition auto-failure, disadvantage,
Psionic Guards Intelligence advantage, exhaustion and natural-extremes settings.
The server consumes the shared next-save penalty and commits the roll, cascade
removal, existing source-immunity policy, event and private receipt together.
A unique participant/turn/condition identity serializes competing requests and
returns the first result even after the turn changes or condition disappears.
Stale settings and transaction errors leave all consequences uncommitted.
The result carries both reviewedBonus and final bonus for accurate log arithmetic.

This foundation is deliberately not called by processEndOfTurnConditions yet.
Next: a durable client proposal/recovery API, discovery of existing results before
rolling, explicit review of changed bonuses, then replace the live multi-write
condition-save branch. The submitted equipment/buff bonus is still a reviewed
input, not server-derived. Legendary Resistance choice, duration-only expiry,
other source-immunity durations and complete buff-tick/clock recovery are not
implemented by this RPC. Do not claim complete turn automation or deploy the
broader branch based on these transaction tests alone. Migration applied only
to the existing local Docker database.

Condition-save foundation validation:32 database regression cases pass, including concurrency, rollback, shared-penalty consumption, Guards, disadvantage, permissions, immunity and replay after turn advance. Full gate passes3,200 unit tests, TypeScript197/197, hooks, RAW, coordinates, anchors, build and255.2KB entry. SQL error-level lint, changed-file ESLint and diff whitespace checks pass. No live UI or production behavior changed in this foundation batch.


### Live turn-end condition-save recovery (unreleased)

processEndOfTurnConditions now calls the atomic saved-save path with the exact
outgoing turn token. Its former roll/log/remove/immunity sequence is removed.
advanceTurn returns an explicit failure before advancing when a condition save
cannot be confirmed; it no longer silently skips that save. Initial participant
read errors also stop this step. Duration-only expiry remains the legacy path.

api/conditionTurnSaves persists the request, d20 pool, compatible buff totals and
penalty die before settlement. It discovers an authorized committed receipt
before reading new context or rolling; stale/malformed storage and failed reads
cannot silently generate replacement dice. Overlapping calls coalesce. Explicit
review refreshes context while retaining compatible dice and buff rolls. Unknown
base-bonus confidence blocks automation. The new read RPC permits owner/DM
recovery after the turn changes or the condition ends, without exposing private
tables. The migration is applied only to local Docker.

The actual End Turn browser test injects lost acknowledgements after committed
settlement. Desktop and mobile preserve the outgoing round on the first attempt,
then advance after reload/retry with one original result and one log entry.
The first attempt at this fixture lacked a required buff name and crashed the
initiative strip before clicking; the corrected fixture exercises the intended
save path successfully.

Remaining: expose saved-condition review controls in the UI (the API is present),
including uncertain/low-confidence modifiers. getTargetSaveBonus includes effective
ability-score item overrides but does not yet add all flat equipment save bonuses;
that shared calculation needs its own audit. Legendary Resistance choices,
duration-only expiry, buff ticks and full clock-side-effect recovery remain open.
Do not deploy or call complete based solely on this integration. Proposals remain
local to the originating browser; cross-device durable dice are still separate work.

Live condition-save verification:3,210 unit tests, TypeScript197/197, hooks, RAW,
coordinates, anchors, build and255.2KB entry pass. Both live condition retry browser
cases and44 condition/death-save database/browser regressions pass. SQL error-level
lint and changed-file ESLint pass with the existing any-type warning. No production
migration or deployment.


### Equipment bonuses in shared combat saves (unreleased)

getTargetSaveBonus now includes eligible flat equipment save bonuses using
computeActiveBonuses with no combat-buff input. This keeps equipped/attuned gating
consistent with the sheet and avoids rolling Bless twice. The breakdown names
the equipment contribution. The runConcentrationSave offer uses the same item
bonus in addition to effective Constitution and proficiency. Malformed equipment
save values stop the calculation instead of producing a string/invalid total.

The shared server saving_target_context now fingerprints bonus inputs: character
inventory, ability scores, progression and save proficiencies, or creature scores,
proficiencies and CR. Only an opaque revision is returned, so an attacker does not
receive the target's private inventory. Equipment/stat changes invalidate pending
attack, Propel and condition-save context comparisons before settlement. The
migration is applied only locally.

Coverage includes attuned/equipped gating, ability-override plus protection stacking,
concentration-offer bonuses, and the actual lost-response End Turn flow with both
Bless and a protection item. A database test changes inventory after the context
read and verifies rejection without a result or inventory disclosure.

This does not finish all save automation: standaloneDamage/standaloneConcentration
use a separate caller-supplied modifier contract and require an equipment-bonus
audit too. Saved-condition review UI is now added below; the underlying review
API preserves dice. No production deployment yet.

Equipment-save verification:3,218 unit tests and108 database/browser regressions
pass. TypeScript197/197, hooks, RAW, coordinates, anchors, build and255.2KB entry
pass. SQL error-level lint is clean. Changed test-file lint passes; pendingAttack
retains its pre-existing prefer-const error for rolledDamageRiders and standing
warnings, with no new lint findings from this patch.


### Saved condition-roll review controls (unreleased)

The shared initiative strip now discovers saved condition rolls for the current
actor and turn. DMs can review their current actor; a character sheet exposes
only its own actor's recovery controls. Opening a review checks the authoritative
receipt first, so a lost acknowledgement displays the completed result without
rerolling. Equipment/effect changes can be explicitly reviewed with the base
save bonus; compatible d20, buff and penalty dice and request identity survive.
Confirmation remains separate, with changed inputs disabling confirmation until
review. Closing leaves the saved roll intact. Reloading rediscovers it.

Review and settlement exclude each other while a receipt is loading. A receipt
read failure preserves the proposal. Local storage cleanup errors no longer hide
an already verified result. The dialog traps keyboard focus, restores it on close,
and fits desktop/mobile. Unknown bonuses that prevented the original proposal,
cross-device dice, and the broader combat-clock integration remain open; this UI
recovers existing proposals only. No production migration or deployment.

Verification:3,222 unit tests; required type/hooks/RAW/coordinate/anchor/build/budget
gates green (TypeScript197/197, entry255.2KB). Four local desktop/mobile browser
cases pass, including receipt recovery, changed equipment with preserved dice,
one recorded event, resumed turn advancement, keyboard focus and the standard
overflow probe. Desktop/mobile screenshots reviewed. Changed-file lint clean.


### Standalone concentration equipment bonuses (unreleased)

The live standalone damage controller now adds eligible flat equipment save
bonuses to effective Constitution before creating its durable damage request.
The server still adds proficiency exactly once. The existing inventory snapshot
fences equipment changes, and retries retain the original request/bonus. Invalid
non-integer equipment totals fail before request creation or HP submission.

Live sheet coverage pins an exact DC10 boundary: CON14/proficiency3 with a d20 of4
fails without the ring and succeeds with an equipped, attuned Ring of Protection.
Unequipped/unattuned rings are excluded; a nonproficient character still receives
the ring bonus. Existing War Caster, multiple-hit, reload and lost-response tests
exercise the same flow. No new migration or UI layout change.

This fixes flat equipment only. The standalone offer contract still needs an
explicit exhaustion and temporary-save-effect audit (its snapshot currently lacks
those fields). It must retain damage-time context and receipt replay when expanded.
The shared combat-clock integration remains a release blocker. Not deployed.

Verification:3,227 unit tests and34 local desktop/mobile concentration-sheet
regressions pass. Required type/hooks/RAW/coordinate/anchor/build/budget gates
pass (TypeScript197/197; entry255.2KB). Changed-file ESLint and diff checks clean.


### Standalone concentration exhaustion (unreleased)

Standalone damage and concentration creation now capture exhaustion_level in the
request snapshot. The database derives the 2024 penalty (twice the level) while
holding the character lock, before changing HP. The stored offer retains that
bonus if exhaustion changes later. Client verification uses the same pure rule
and accepts negative bonuses down to the contract's valid lower bound.

Old committed requests replay unchanged. New legacy requests without exhaustion
are accepted only while actual exhaustion is zero; exhausted characters must
reload for an explicit snapshot. A stale snapshot rejects before HP changes.
The new function definitions preserve existing ownership, request identity,
replay and atomic HP/offer behavior. No old receipts are rewritten.

Migration 20261010000858_standalone_concentration_exhaustion.sql was generated by
the CLI and applied only to local Docker in a transaction with its ledger entry.
Normal migration up remains blocked by the unrelated 20261008213500 local ledger
entry; that entry and local data are preserved. Temporary save effects remain
separate work; this patch does not claim Bless/Bane or all standalone automation
complete. The combat-clock release blocker remains. No production deployment.

Rules verified against the official 2024 glossary, Exhaustion / D20 Tests:
https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/#ExhaustionCondition

Follow-up found during this audit: CharacterSheet/index.tsx still has a local
rollConcentrationSave used by campaign HP-change/prompt paths (callers around494,
801,1678). It reads computeStats.saving_throws.constitution.total and does not yet
include flat equipment, exhaustion or temporary save effects. Replace that
remaining split path with durable shared settlement rather than assuming the
standalone fix covers campaign manual HP edits.

Verification:3,244 unit tests and140 local database/browser cases pass, including
both mobile and desktop exhaustion boundaries and legacy receipt recovery.
Required type/hooks/RAW/coordinate/anchor/build/budget gates pass (197/197 carried
TypeScript errors; entry255.2KB). Local SQL error-level lint is clean; changed-file
ESLint has only the existing any-type warning. No production migration or deploy.


### Temporary modifiers on standalone concentration saves (unreleased)

Standalone damage/save creation now rolls active saving-throw modifiers with the
canonical dice module and persists their faces/totals alongside the original
request before network I/O. The modifier sent to the existing reviewed-bonus
contract includes these effects; proficiency and exhaustion remain server-added.
A retry sends the original aggregate and never rolls its effects again. New
requests snapshot active_buffs; a changed effect rejects before changing HP.
Old committed requests replay unchanged, while a new legacy request with active
buffs must reload instead of silently ignoring them. Queue and cancellation bounds
now both accommodate the bounded effect total.

The death-save effect helper is renamed saveBonuses and shared instead of copied.
It recognizes the sheet's old Bless (saveBonus:0) and Bane (name-only) presets,
handles explicit numeric/dice bonuses and signed dice penalties, and avoids
stacking duplicate named Bless/Bane entries. Positive die faces plus a negative
multiplier preserve Bane's evidence. Unsupported expressions stop the request.
Malformed saved effect arithmetic is rejected. Non-concentrating damage creates
no effect dice. Automatic death saves use the same corrected calculation.

Limits: the server still accepts a reviewed aggregate modifier; it fences the
source buffs but does not independently derive their dice. Effect faces survive
unconfirmed requests in this browser; after confirmation the server retains the
aggregate, not a cross-device effect-dice breakdown. Advantage/disadvantage from
temporary effects and other legacy campaign-sheet saves remain follow-up work.
No production migration or deployment. Local migration was applied transactionally
with its ledger entry, preserving the unrelated local migration-history mismatch.

Rules sources: https://www.dndbeyond.com/spells/2618933-bless and
https://www.dndbeyond.com/spells/2618900-bane .

Verification:3,250 unit tests and required type/hooks/RAW/coordinate/anchor/build/
budget gates pass (197/197 TypeScript; entry255.2KB). 108 database/browser cases
passed in the broad run; both new desktop/mobile effect-recovery cases pass after
fixing the fixture's global-random sequence and waiting for the committed hit
before removing effects. This gives110 verified cases. SQL error-level lint is
clean; changed-file ESLint retains only the existing any-type warning. No deploy.


### Shared campaign damage concentration modifiers (unreleased)

The existing DM party-damage flow now includes eligible flat equipment bonuses
and persisted temporary saving-throw dice in its request. The server adds
proficiency and subtracts exhaustion exactly once when it creates the durable
concentration offer. Combatant exhaustion/buffs override stale sheet values in
an active encounter; between encounters the character snapshot supplies them.
Effect dice are not rolled when damage is immune, the hit breaks concentration
at zero HP/incapacitation, or automation suppresses the save.

The context snapshot now includes both sources' effects and exhaustion, so a
changed modifier invalidates a fresh application before HP/offer writes. Existing
committed request identities replay before the fresh-context check. Saved request
validation verifies effect-dice arithmetic; old proposals remain readable for
receipt recovery or cancellation. This retains DM-only party-damage authorization.

This repairs the live shared transaction that player-sheet damage should reuse.
CharacterSheet's legacy manual/realtime damage save path has NOT yet been replaced;
owner-scoped access, sheet recovery controls and stale HP/turn checks remain the
next integration work. This is not a claim that all campaign saves are fixed.

The migration was created through the CLI, then ordered after the latest existing
party context definition as 20261010070001_party_concentration_modifiers.sql. Several
existing versions are ahead of the machine clock, so keeping the CLI's earlier
stamp would let a later historical migration overwrite this fix on fresh replay.
Applied only to local Docker with its ledger entry, preserving unrelated local
history. No production migration or deployment.

Verification:3,253 unit tests and58 local campaign database/browser regressions
pass. The live recovery case combines a protection item, Bless, Bane, a flat
modifier and exhaustion, then changes current effects and verifies the original
offer still settles at the captured total. Required type/hooks/RAW/coordinates/
anchors/build/budget gates pass (197/197 TypeScript; entry255.2KB), as do changed-
file ESLint, diff checks and SQL error-level lint. No production deployment.


### Propel declaration revalidation (unreleased)

Propel now rechecks live Energy Dice and saved unconfirmed requests after its
asynchronous turn read, before rolling or declaring. An exhausted pool or a
request saved by another tab during that read no longer starts another roll.
It also compares encounter, participant, actor and owner-turn identities rather
than relying on the turn identifier alone. Server validation remains authoritative;
these checks prevent avoidable client rolls, not all cross-tab races.

Verification: 3,259 unit tests and the full required gate pass; changed-file
ESLint and diff checks are clean. All six added regressions fail against the
original component (the five existing tests still pass), then pass with the fix.
No visual layout or database changes. Not deployed. Campaign-sheet damage recovery
and the shared combat-clock integration remain release work described above.


### Campaign damage owner access (unreleased)

The shared campaign damage preview, application, and cancellation functions now
permit the target character's owner as well as the current campaign DM. Another
campaign member has no such access. Mutations authorize against the locked current
character before replaying a receipt or changing anything, so an old owner cannot
recover someone else's damage after ownership changes. Removing the character
from the campaign blocks old campaign requests for both owner and former DM.
Existing grants, private ledger restrictions, snapshot validation, concentration
modifiers, and idempotency are preserved.

Migration 20261010070002_party_damage_owner_access.sql was created with the CLI
and ordered after the existing future-dated definitions to keep fresh replay
correct. Applied only to local Docker, with its ledger entry; unrelated local
migration history was preserved. No production changes.

Verification: 58 database regressions pass across the two configured projects,
including owner preview/application, DM receipt replay, owner cancellation,
outsider/member/anonymous rejection, ownership transfer and campaign removal.
The full gate passes (3,259 unit tests, 197/197 TypeScript, entry255.2KB), changed-
file ESLint and diff checks are clean, and local SQL lint/security advisors report
no errors. These SQL tests do not certify player-sheet UI behavior.

Next: wire player-sheet manual damage to this shared transaction after flushing
queued edits; preserve saved requests across reload; safely reconcile HP and
concentration receipts; verify interrupted requests in the real sheet. The old
campaign-sheet damage path is still active until that integration is complete.


### Campaign sheet damage recovery (unreleased)

Owner-sheet damage now uses the shared campaign transaction instead of separately
saving HP and locally rolling concentration. It flushes queued edits, reads a
fresh damage context, and saves the original hit before sending. The sheet blocks
HP/rest controls until an uncertain hit is confirmed or canceled; reload preserves
its identity. Recovery never processes another character's or a group batch from
the current sheet. Those requests remain available on their original surfaces.

Verified sheet receipts carry ordered current HP and concentration state, so a
replay cannot restore the hit's old casting. Automatic checks use the existing
saved concentration result and reread the damage receipt afterward. An unconfirmed
automatic save keeps the hit recoverable. Prompt checks use the existing shared
concentration modal. Zero HP ends concentration without an unnecessary save.
Late previews are rejected after changing sheets, including away-and-back changes;
new pending edits or another tab's saved hit block new effect rolls.

This removes the legacy local concentration-roll path for manual sheet damage.
The realtime fallback for externally written HP still exists and remains audit
work, as do combat-clock journaling and other general saving-throw callers.
No production deployment or new migration in this batch; owner-access migration
20261010070002 is its prerequisite.

Verification: 10 local desktop/mobile browser cases cover lost replies, reload,
cancellation, exact modifiers, automatic failure, and zero HP. No unexpected
console/HTTP errors; desktop/mobile recovery screenshots inspected and overflow
checks passed. The unit regressions cover queue ordering, request persistence,
automatic-save recovery, group/other-character rejection and scope changes.
The full gate passes; TypeScript debt dropped to196 and CI is ratcheted accordingly.


### Turn-effect damage at zero HP (unreleased)

The live buff-tick caller now consumes temporary HP when a character is already
at zero HP, while still adding the required death-save failure and breaking
stability. A tick at least as large as maximum HP now records immediate death;
subsequent healing ticks in that same processing pass cannot revive the dead
character. The event records the amount, remaining temporary HP and fatal-hit
reason. Positive-HP overflow handling is preserved.

The death-state calculation lives in rules/deathSaves.ts and uses the canonical
HP pool helper at the caller. Source: 2024 Basic Rules, Damage at 0 Hit Points
and Temporary Hit Points:
https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game#DeathSavingThrows
No imported rule text or UA licensing change.

Verification: 3,284 unit tests and all required gates pass (196/196 TypeScript,
entry255.2KB). Five live-caller regression cases fail against the old implementation
and all six pass with the correction; eight pure rule cases cover fatal/nonfatal
thresholds and invalid state. Existing buffs.ts lint warnings remain, with no lint
errors. No UI/database change or production deployment.

The turn-clock audit is not complete. advanceTurn still performs multiple writes
and non-idempotent effect ticks around its clock update; failed tick writes are
not yet a durable recovery boundary. Mind Sliver expiry still requires a complete
transition ledger. Those remain release work, not certified by these arithmetic
tests. Next integration must cover both outgoing and incoming effects rather than
just swapping the clock call and risking duplicate damage after a lost reply.


### Atomic turn-effect batch boundary (unreleased; caller integration pending)

Migration 20261010070003_atomic_turn_effect_batches.sql adds a DM-only transaction
for a participant's turn-start or turn-end effect batch. HP/temp HP, death counters,
stability/death state, one-shot removals and ordered combat events commit together.
A private unique ledger fences participant + turn + timing. Same-request retries
return the original receipt without changing later HP or emitting another event;
a different request ID cannot reapply the same boundary. A receipt reader permits
recovery after the turn moves, but only for the current DM.

Fresh applications require the current actor/turn and an exact combatant snapshot.
The lock order is character, encounter, participant, combatant, with identity
rechecked after locking. New endpoints expose invoker wrappers around private
privileged functions; direct ledger/state-helper access remains revoked. Mutable
fields and event types are restricted, pools/counters are bounded, and metadata
such as target name and visibility comes from the server's participant.

This is a transaction boundary for DM-calculated effect results, NOT independent
server evaluation of dice or spell rules. It does not yet route the live
processTurnTicks caller, automate Searing Smite saves, or fix concentration/typed
resistance gaps in that caller. Read receipts describe the original result, so a
future client must refresh current combat state rather than replaying old HP into
its store. No production deployment.

The file was generated by the CLI then ordered after existing future-dated
migrations for replay safety. Applied only locally with a ledger entry; unrelated
local migration history was preserved. Verification:22 database cases across the
two configured projects pass, including concurrent requests, stale state, changed
request identity, private permissions, former-DM revocation and full rollback on
an event-insert failure. SQL lint and security advisors are clean. The full gate
passes (3,284 units,196/196 TypeScript,entry255.2KB); changed-file ESLint and diff
checks pass.

Next: persist original effect proposals before sending, read receipts before
rolling, and connect processTurnTicks. Outgoing failures must stop the boundary;
incoming failures need a resumable phase so retrying cannot accidentally advance
another turn. Only after both are recoverable should advanceTurn switch to the
atomic combat-clock API and remove its legacy duplicate clock/buff writes.


### Saved turn-effect request client (unreleased; caller integration pending)

src/lib/api/turnEffects.ts now persists complete effect proposals and reads the
server's participant/turn/timing receipt before preparing any dice. Interrupted
submissions keep their original request ID and payload. Same-tab requests
coalesce; server uniqueness resolves competing tabs. Recovery uses the recorded
winner rather than applying another proposal. Storage is scoped to user,
encounter, participant, turn and timing, with a discovery function for turn
recovery controls. Malformed requests/receipts fail closed. JSONB key ordering
is accepted without weakening outcome comparisons.

An acknowledged receipt is not hidden by browser-cleanup failure. Its state is
historical and must not be written back as current HP; callers should refresh
combat state. Preparation callbacks must still guard UI scope and obtain fresh
turn state. Invalid or stale proposals remain saved for explicit review: there
is no silent reroll/cancellation path in this API.

Verification:13 client unit regressions and2 actual desktop/mobile browser
recovery cases pass. The browser drops both commit replies, reloads, then reads
the original result without invoking the preparation callback or replacing later
healing. The initial browser fixture lacked auth timestamps; that fixture was
corrected and the final isolated run passes. Full gate passes (3,297 units,
196/196 TypeScript,entry255.2KB); ESLint and diff checks pass. No new migration,
UI layout change or production deployment.

Next: connect processTurnTicks and the turn controller to this client, including
explicit recovery for an incoming effect that fails AFTER the clock advances.
The live turn button still uses its older effect writes; these tests verify the
new API end to end, not a completed turn-controller migration.

### Turn-effect rules planner (unreleased; recovery integration pending)

The live buff tick processor now delegates calculations to src/rules/turnTicks.ts.
The planner produces complete HP/temp-HP/death-save/stability/death/buff outcomes
and ordered event payloads without database or logging dependencies. The TurnTick
type lives with the rules; buffs.ts re-exports it for existing consumers. Dice use
the canonical roller, with injection for deterministic tests. The legacy adapter
retains its narrow patch shape so unchanged buff/death fields are not newly
written from an old snapshot.

Ten new rule cases cover timing selection, dice plus flat amounts, immutable
inputs and retained metadata, damage/save/removal ordering, lethal interruption,
healing resets/caps, current temp-HP policy, already-dead actors, creature versus
character handling, zero-amount one-shots and empty effects. Existing live-caller
regressions still pass. Full verification passes:3,307 units,196/196 TypeScript,
RAW/coordinates/anchors/hooks/build/budget,entry255.2KB. Changed-file ESLint has
zero errors (12 existing any warnings in buffs.ts); diff check passes.

This is preparation for atomic persistence, not completed turn recovery. The
live caller still has its previous writes and failure handling. Concentration,
typed defenses, save-ends automation and explicit temp-HP replacement choice
remain gaps. No UI change, migration or production deployment.

Next: connect the planner to the saved turn-effect client and add an explicit
incoming-turn recovery phase before changing clock writes. A failure after the
clock moved must resume effects without advancing again; a changed/dead actor
must not be interpreted against a shifted filtered roster. Stale saved proposals
need an explicit review path rather than silent rerolls or indefinite blocking.

### Authorized turn-effect preparation (unreleased; turn button pending)

Migration20261010070004 adds get_turn_effect_context, a public invoker wrapper
around a private DM-authorized reader. It returns one actor/turn/combatant snapshot
and rejects stale turns, mismatched or ended encounters, missing combatants and
an actor no longer occupying the active slot. It does not hold locks after the
read; commit_turn_effect_batch still validates the turn and exact state before
writing. Player and former-DM access is rejected; anonymous execution is revoked.

processSavedTurnEffects in src/lib/api/turnEffects.ts now connects this snapshot
to the canonical turnTicks planner and saved-request client. Receipt/proposal
recovery precedes fresh preparation. User/identity/state/buff shape checks and
the caller's UI scope guard run before effect dice. Failed commits keep the
original computed proposal. Returned receipt HP remains historical and must not
replace refreshed live state. This adapter has no live advanceTurn caller yet:
incoming recovery and dead-actor roster handling must be coordinated first.

Verification:11 additional client cases (24 in that module),32 local database /
browser cases across desktop and mobile, and the full gate pass (3,318 units,
196/196 TypeScript,entry255.2KB). The actual browser recovery test now uses the
snapshot+planner adapter, loses both commit replies, reloads, and verifies no
new preparation, duplicate effects or overwrite of subsequent healing. Database
SQL lint and security advisors are clean; changed-file ESLint and diff checks
pass. Only the reviewed local migration was applied and recorded; unrelated
local ledger version20261008213500 was preserved. No production deployment.

Next: the live turn controller must journal its incoming phase before it can
fail, resume it before any new advance, and retain the outgoing actor identity
when death changes the filtered roster. Add explicit stale-proposal review and
complete clock/other turn-effect coordination before switching the live caller.
The existing rules gaps (typed defenses, concentration, save-ends automation,
temp-HP replacement choice) remain open.

### Clock handoff after lethal turn effects (unreleased)

Migration20261010070005 fixes atomic clock handoffs after an end-effect batch
kills the outgoing actor. The saved end-effect participant anchors the successor
selection instead of interpreting the old index against the shortened living
roster. A first-actor death can correctly hand slot zero to its successor without
advancing the round; a last-actor death wraps exactly once. Conflicting recorded
outgoing actors and ambiguous initiative positions fail closed.

Every atomic handoff now pre-records its new turn UUID in the private transition
ledger before updating the encounter, in the same transaction. The turn trigger
accepts that UUID only for a writer with private-ledger INSERT privilege and an
exact matching recorded old turn/new turn/index/round. Ordinary authenticated
writes retain their previous inability to choose or rewind turn IDs. This avoids
reusing a turn ID when the successor takes the same numeric slot and round.
Client receipt validation allows this valid non-wrapping slot-zero transition
while continuing to reject a round wrap into a nonzero slot.

A completed end-effect batch closes fresh effect preparation/application for
that encounter turn, so the shifted successor cannot receive effects under the
outgoing actor's old UUID. Original saved receipts remain recoverable. The new
migration was applied only to local Docker with its ledger entry; unrelated
history was preserved.

The atomic clock is still not the live advanceTurn writer. This fixes an observed
integration prerequisite, not the complete live controller. A durable outgoing
identity before other turn work, incoming-phase recovery, stale-proposal review,
and coordination of remaining non-atomic turn operations are still required.
Deletion of an outgoing participant (which cascades its effect receipt) and
manual roster edits need explicit controller handling before live rollout.

Verification:114 clock/effect database and browser regressions pass across the
two configured projects, including six new lethal-handoff/security scenarios
per project, saved-request replay, rollback, next-save expiry, concurrency and
lost replies. Full gate passes (3,320 units,196/196 TypeScript,entry255.2KB);
changed-file ESLint, SQL lint, security advisors and diff checks pass. No UI
layout change or production deployment.

### Server-selected clock preparation (unreleased)

Migration20261010070006 extracts the successor/round calculation into one private
selector shared by the locked commit and the DM-only get_combat_clock_context
reader. Preparation includes the recorded outgoing actor after lethal end effects,
so the client does not duplicate filtered-roster arithmetic. The private selector
is not executable by authenticated clients. Commit still rechecks the current
roster and rejects a stale proposal; reading a context does not reserve a turn.

getCombatClockContext validates the returned owner, turn, actor identities,
positions and counters. prepareCombatTransition saves the server-selected request
before any clock mutation, coalesces concurrent preparation in a tab, preserves
existing pending/confirmed work, checks caller scope after the read, and rechecks
for a request saved by another tab while waiting. Storage failures cannot submit
a clock mutation. A recovered receipt remains historical; it must not replace
current encounter state or authorize old effects against a later turn.

This remains a prerequisite for the live controller, not a turn-button rollout.
Stale saved proposals and losing requests from concurrent tabs still need an
explicit reconciliation path. Remaining non-atomic aura, recharge, mastery and
budget operations must be coordinated with outgoing/incoming recovery before
replacing advanceTurn's legacy clock writes. No production deployment.

Verification:94 local clock/expiry/database/browser cases pass across desktop and
mobile, including the new preparation, permissions, stale-position and lost-reply
recovery cases. A recovered old advance leaves a subsequently advanced encounter
unchanged and performs no new preparation. Full gate passes (3,338 units,
196/196 TypeScript,entry255.2KB); changed-file ESLint, SQL lint, security advisors
and diff checks pass. Only the new reviewed migration was applied locally with
its ledger entry; unrelated local history remains intact.

### Clock winner recovery (unreleased)

Migration20261010070007 adds a DM-authorized historical clock reader keyed by
encounter and expected outgoing turn, with an index for that lookup. It returns
null only when no transition is recorded, rejects ambiguous history, remains
available after combat ends and rechecks current campaign ownership. Anonymous
callers cannot execute it; the private ledger remains inaccessible to clients.

confirmCombatTransition now reads the authoritative winner before submitting an
advance. It validates the recorded request and receipt, retaining the original
proposal when the lookup is unavailable, malformed or points to a different
actor/position/round. Recovery of its own request confirms the clock without
resending it. A matching winner with another request ID is saved as clock-observed,
keeping the original local request and the actual winning receipt distinct.

An observed winner proves only that the clock moved: another caller may already
have run incoming effects. Therefore beginCombatTransitionEffects and completion
cannot treat clock-observed as permission to run or silently finish those effects.
The state survives reload and suppresses additional clock mutations. Explicit
reconciliation and incoming-effect completion tracking are still required before
live rollout; this does not resolve every stale-request case or connect the live
advanceTurn buttons. No production deployment.

Verification:102 local clock/expiry/database/browser regressions pass across
desktop and mobile. New browser coverage retains a losing local proposal,
observes the matching server winner, blocks incoming-effect execution, survives
reload and sends zero additional clock mutations. The original lost-reply case
also passes with receipt-first confirmation. Full gate passes (3,350 units,
196/196 TypeScript,entry255.2KB); changed-file ESLint, SQL lint, security advisors
and diff checks pass. Only the reviewed new migration was applied locally and
recorded in the ledger; unrelated local history was preserved.

### Live turn-handler overlap guard (unreleased)

advanceTurn now coalesces overlapping calls for one encounter in the same tab.
InitiativeStrip, DMScreen and the character-sheet action controls all call this
shared handler, so separate controls cannot start concurrent copies of its
turn effects and writes. The guard is released after success or failure;
different encounters remain independent. Unexpected exceptions become an
explicit failure result for the existing callers rather than an unhandled
rejection. This does not make a later retry idempotent or coordinate browsers;
the durable turn-controller migration remains required before branch release.

Five new caller tests cover a full successful advance/effect pass, later calls,
failed reads, unexpected exceptions and encounter isolation. The browser test
holds the first encounter read, overlaps two real advanceTurn calls, then checks
that both share the result and only one encounter write occurred. Desktop and
mobile pass. The initial fixture's request hold was bypassed by the service
worker; blocking service workers in this network-controlled fixture (as other
recovery suites do) fixes the harness. All six affected browser cases pass in
the final isolated run, including existing lost-reply and competing-request
recovery cases. No UI layout or database migration change.

Removed an existing unused combat-start chain ID (emitCombatEventChain owns its
IDs). Type diagnostics fell from196 to195; CI's baseline was ratcheted to195.
Full gate passes (3,355 units,195/195 TypeScript,entry255.2KB). Changed-file ESLint
has no errors (34 pre-existing warnings in combatEncounter.ts); diff checks pass.
No production deployment. Remaining work includes durable incoming/outgoing
phases, explicit stale/observed-request reconciliation and non-atomic turn
operations before the legacy clock writes can be replaced.

### Map turn-button feedback (unreleased)

The active InitiativeStrip now disables End Turn while its advance is pending,
shows Ending… with aria-busy, and blocks repeated clicks immediately. A failure
stays visible until dismissed and asks the DM to check combat before retrying,
because the legacy sequence can already have applied partial effects. Delayed
feedback is suppressed after unmount or switching encounters.

Correction to the preceding entry: DMScreen still imports the shared handler but
its dashboard tab is retired (absent from navigation and restored-tab whitelist).
The reachable controls are InitiativeStrip and character-sheet ActionEconomy;
this change deliberately targets the active map control.

The new local browser regression passes on desktop and mobile: one held request,
disabled pending control, repeated click ignored, persistent/dismissible failure,
unchanged turn and clock, no unexpected browser/network errors. Screenshots were
inspected and the skill overflow probe passes for the controls and toast. Reverting
the UI fix makes the regression fail on the missing disabled Ending… control;
restoring it passes both viewports. Changed-file ESLint has zero errors and four
existing InitiativeStrip warnings. No production deployment; durable turn-phase
integration and reconciliation remain release prerequisites.

Full required gate passes: 3,355 unit tests, 195/195 TypeScript diagnostics,
React hooks, RAW, coordinates, anchors, production build and 255.2 KB entry
budget. Final browser run: two passed; diff check clean.

### Atomic deterministic turn budgets (unreleased)

The saved combat-clock transaction now resets the incoming participant's action,
Bonus Action, reaction, movement, leveled-spell flag, Dash, Disengage and attack
count together with the new turn identity. It clears once-per-turn markers for
that encounter's whole roster, because those apply on every creature's turn.
Outgoing action budgets and other encounters remain untouched. Roster locks are
acquired in ID order before successor validation and combatant duration writes.

Receipt replay returns before any reset, preserving actions and markers spent
after the acknowledged transition. A later failure rolls back the budgets along
with the clock. The public API and DM authorization stay unchanged. This removes
a prerequisite for the durable controller, but the legacy live handler still
needs replacement: remove its separate deterministic resets when wiring this
transaction. Recharge dice, legendary-action logging, mastery effects, aura work
and incoming-effect recovery remain separate integration work. No deployment.

Verification: all 114 local clock/expiry/browser cases pass across desktop and
mobile. Four added cases cover incoming-only reset, encounter-wide marker scope,
receipt replay after new spending, rollback and rejected/unauthorized requests.
The reset case failed against the prior database implementation before applying
the migration. Full gate passes (3,355 units,195/195 TypeScript,255.2 KB entry).
SQL lint, security advisors, changed-file ESLint and diff checks pass. Migration
20261010070008 was applied and recorded only in the existing local Docker stack;
no reset or changes to unrelated migration history. Supabase function guidance
and the current database changelog were reviewed; no new API dependency.

### Recharge rules prerequisite for durable incoming turns (unreleased)

Review found the legacy advanceTurn loop and MonsterActionPanel labels assume
all roll-recharge actions succeed on 5–6. That is not the rule: the action's
listed d6 result/range controls success. The generic usage flag alone does not
supply that range. The current local catalog has no roll-recharge examples, so
it cannot establish whether production retained every needed threshold.

Added a pure rules planner that reads explicit action title/usage ranges,
recognizes single-face recharge, rejects malformed/conflicting data, validates
all expended actions before rolling and uses the canonical d6 roller once per
expended action. Its returned plan carries the exact ranges, dice, outcomes and
remaining actions for a future saved transaction. Unknown thresholds require
review; none default to 5–6. Prose is deliberately not scanned for unrelated
ability references. Source: [2024 Basic Rules, Limited Usage](https://www.dndbeyond.com/sources/dnd/br-2024/how-to-use-a-monster#LimitedUsage).

This planner has no live caller yet. Next integration must persist the proposal,
commit recharge changes/events once per participant/turn, recover receipts before
rolling, read actual catalog action data and update the panel's hard-coded labels.
Rest-based recharge is also separate. The existing live recharge loop remains
incorrect until replaced; this entry does not claim that loop is fixed. No UI,
database migration or production deployment in this change.

Verification:27 new rule cases pass, including exact-face success, mixed ranges,
malformed data, conflicting labels, duplicate/missing actions, pre-roll batch
validation, invalid die values and no-op batches. Final required gate passes
(3,382 units,195/195 TypeScript,255.2 KB entry); ESLint and diff checks clean.

### Saved recharge batches and browser recovery (unreleased)

Added DM-only preparation, commit and receipt APIs for one recharge batch per
participant/turn. Preparation validates the active actor and open turn, returns
its current expended names and accessible catalog actions, and preserves the
catalog's private-content restrictions. Commit locks campaign, encounter,
participant and catalog context, compares the complete saved snapshot, validates
the submitted dice/ranges, derives success, and saves remaining recharge uses,
ordered visibility-aware combat events and the receipt atomically. Duplicate
requests replay the original receipt; competing request IDs cannot roll the same
turn again. Later resource spending survives replay, even after combat ends.
As with DM-prepared turn-effect damage, the server validates the submitted plan
and snapshot; it does not independently prove the client's dice fairness or
re-parse the recharge ranges. The pure rules planner supplies those ranges.

The client now reads receipts before preparing dice, checks owner/scope after
asynchronous preparation, validates all actions, persists the exact proposal
before commit, coalesces simultaneous calls, and retains uncertain requests.
A receipt is historical and must not replace current participant resources.
Nullable catalog usage labels are accepted without inventing a recharge range.

This API is not wired into the live advanceTurn pipeline yet. It is ready for
that controller's incoming phase; the old recharge loop and fixed 5–6 labels
still need replacement together with the remaining timed-effect integration.
No production deployment or user-data reset. Migration20261010070009 was applied
and recorded only on the existing local Docker database; unrelated ledger
history was preserved.

Verification:30 local database cases plus two real-browser lost-reply/reload
cases pass across desktop/mobile. Browser recovery preserves both original dice
and later spending, with one preparation and no additional commits after reload.
Twelve new client unit cases cover persistence, identical retries, receipt-first
recovery, overlap, scope changes, blocked storage, unknown thresholds, malformed
snapshots/receipts and retained corrupt requests. Full gate passes (3,394 units,
195/195 TypeScript,255.2 KB entry). SQL lint, security advisors, changed-file
ESLint and diff checks pass. Initial unit setup used unavailable jsdom; corrected
to the repository's existing happy-dom environment, with no new dependency.

### Atomic legendary-action refill and accurate live log (unreleased)

The saved clock transaction now refills the incoming participant's legendary
pool and emits its visibility-aware refill event in the same transaction as
budgets and turn identity. It preserves the existing configured total/lair
adjustment, leaves outgoing and already-full/overfilled pools alone, and exits
on receipt replay before any refill. Event failure rolls back both the refill
and the other turn changes. This migrates the existing behavior; it does not
claim every catalog monster's configured legendary total has been audited.

The legacy live handler's event now reports the actual lair-adjusted refill
instead of incorrectly reporting only the base total. Two unit cases cover the
normal and lair paths. The new server path still awaits the durable controller;
remove the old refill write/event when integrating it to avoid duplicate logs.
Aura saves/damage, timed mastery markers, movement-gated feature recovery and
full phase reconciliation remain integration work. No production deployment.

The database tests exposed an additional live bug: the original remaining<=total
constraint rejected the configured +1 lair refill. The migration replaces it
with a bounded allowance of one extra use for nonzero pools (a use can remain
after leaving the lair); zero pools still allow none. A fixture that tried to
store five uses in a three-use pool was corrected to the valid four-use case.

Verification: the initial full clock run passed124 cases and failed four
(two affected cases on each viewport). After the constraint correction, all16
legendary cases pass on desktop/mobile, including both formerly failing cases,
new pool-bound checks, receipt replay and event-failure rollback. Two additional
live-handler browser checks pass with the lair fixture: one advance and one
correct refill event to four uses. The pre-migration normal/lair refill tests
failed as expected. Final required gate passes (3,396 units,195/195 TypeScript,
255.2 KB entry); SQL lint/security advisors and changed-file ESLint pass (34
existing combatEncounter warnings, no errors). Migration20261010070010 is applied
and recorded locally only; no reset or unrelated history changes.

### Correct live Vex end-of-turn expiry (unreleased)

Vex previously used a second start-of-turn sweep to approximate its deadline,
leaving Advantage available after the attacker's next turn ended. New markers
now arm at the next own start and expire at that turn's end. The same lifecycle
handles hits during the attacker's turn and reactions during another turn.
Repeated start processing does not expire an armed Vex early. Existing saved
Vex markers upgrade at their first source start, and already-armed legacy
markers expire at the source end. Sap/Slow keep their start-boundary expiry.
The pure boundary rule replaces the old imperative expiry decision logic and
is wired into the actual live handler's outgoing and incoming phases.
Source: [2024 Basic Rules, Vex](https://www.dndbeyond.com/sources/dnd/br-2024/equipment/#Vex).

Round-wrap duration processing also read the original roster snapshot, which
could restore removed markers or undo their newly armed state. It now obtains
current combatant buffs after the turn effects. Missing/failed reads refuse an
empty replacement. This fixes the demonstrated stale-snapshot resurrection;
the remaining legacy read/write sequence is not an atomic concurrency guarantee.
The saved clock transaction still needs corresponding timed-marker integration
before replacing the live controller. No migration or deployment in this change.

Verification:15 new rule/repository/live-helper unit cases pass. Six real-browser
cases pass on desktop/mobile through advanceTurn: own-turn hits, off-turn hits,
next-end expiry and single-actor round wraps with another timed buff. Advantage
is present during the valid turn and absent afterwards. Restoring the old roster
snapshot read makes the single-actor regression fail by undoing the armed expiry
state; restoring the fix passes all six cases again. Full gate passes (3,411
units,195/195 TypeScript,255.2 KB entry), changed-file ESLint has no errors and
diff checks pass. This is a live timing correction, not completion of the durable
turn controller or a guarantee against all concurrent buff edits.

### Atomic mastery expiry in the saved clock (unreleased)

Migration20261010070011 brings the verified Vex/Sap/Slow boundary rules into
commit_combat_clock_transition. It expires the outgoing end markers before
arming/removing incoming start markers, then ticks round durations against
that resulting list. Combatants are locked and processed once, including
shared roster links and a one-actor encounter. Unrelated metadata is retained.
The internal pure SQL helper is not callable by anon/authenticated clients;
parity cases compare it with rules/masteryExpiry.ts, including legacy markers.

Expiry events, legendary refill, action budgets, durations and turn identity
commit or roll back together. Hidden targets retain hidden event visibility;
event sequences remain distinct when a legendary refill precedes expiry.
Receipt replay exits before effect writes, preserving subsequently added buffs.
A forced event failure verifies that buffs, budgets, time and the receipt all
roll back. The migration is applied/recorded only in local Docker, preserving
the unrelated local migration ledger entry. No reset or production deployment.

The live controller still uses its existing expiry sweeps. This transaction is
a prerequisite for replacing that controller, not a second live sweep. Remaining
integration includes movement-gated feature recovery, aura effects, incoming
recharge/death-save/effect recovery, and reconciling another request's turn
completion before allowing a further advance.

Verification: full project gate passes (3,411 units,195/195 TypeScript,255.2 KB
entry), changed-file ESLint and SQL lint/security advisors pass. One existing
attack-dialog unit test failed in the initial gate, passed in isolation, then
passed in the repeated complete gate; no attack-dialog code changed.
All 146 clock regressions pass on desktop/mobile, including ten new expiry cases.
