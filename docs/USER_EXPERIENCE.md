# DNDKeep — user experience direction

Established September 10, 2026 from Jared's request to improve the app with the
user in mind. This complements ROADMAP.md; it does not replace the existing
rules/map tracks or authorize rules changes.

## Product principle

Help a player confidently take their next action, and help the DM keep the
session moving. Preserve the connected character sheets, rules automation and
map; improve the complete play loop before chasing feature count.

## Foundation — v2.695.0, implemented locally

- Reliable sheet saves: an account/character-scoped partial-write queue drains
  slow requests in sequence and keeps failed changes for explicit retry. A
  cross-page notice keeps errors reachable after navigation. Before-unload
  prompts protect pending changes where the browser supports them. Successful
  saves stay quiet, preserving the earlier no-layout-shift decision.
- Recoverable creator: versioned browser-local drafts, Resume/Discard, validation
  of stored shapes, account separation, storage failure feedback, and clearing
  only after successful creation. Recommended loadouts remain the default.
- Mobile New links to /creator. Character pages remount the sheet per account
  and character to avoid carrying local state to another character's queue.
- Beta landing copy comes from BETA allowances. Normal pricing remains behind
  the existing beta flag; invite contact is still intentionally unconfigured.
- Vitest searches this checkout's src/ only, excluding nested worktree copies.

Tests cover slow overlapping writes, failure and retry with newer values,
navigation/unmount, account-scoped recovery notices, unload warnings, malformed
drafts, blocked storage, functional form updates, and actual creator remount and
submission using a mocked backend. No database writes are required by these tests.

Public beta panel visually checked in the in-app browser at desktop and 393px.
Authenticated live gameplay was not exercised: the local database was not
running. This is not a full multiplayer/offline recovery implementation. Failed
sheet changes remain in the current browser tab's memory, not durable storage;
creator drafts are stored on the device, not synchronized between devices.

## Next batches — validate with real play before broad redesign

1. Invitation/code → choose/create character → ready at the table; add a clear
   returning-player Resume Session path.
2. Observe one complete DM/player encounter. Simplify the highest-friction turn
   using existing initiative, token, action-economy and combat surfaces.
3. Consistent action receipts: actor/target, modifiers, resources, outcomes and
   manual rulings. Add scoped correction tools that respect later/remote edits.
4. Give phones task-focused access to character, actions, map and session log.
5. Validate reconnect with multiple participants and visible pending actions.

Preserve role-aware campaign views, full descriptions when comparing choices,
the map-centered session design and the current invite-only/no-shop beta.
Do not reintroduce deliberately removed campaign recap/notes tabs by assuming
they were overlooked. Use current code and later owner decisions when older
README/launch-plan wording conflicts.

Measure invitation-to-ready time, unassisted first turns, common-action steps,
mistake recovery, lost/duplicated updates and whether groups return to play.
