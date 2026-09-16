# Release readiness — September 16, 2026

Target: invite-only beta, billing disabled, two characters and one campaign per
tester. This follows `src/lib/betaMode.ts` and the August 30 owner decision.
Paid launch is a later milestone; the older store-first MVP plan is historical.
ROADMAP.md remains the plan of record; this is its release acceptance checklist.

## Ordered action items and working solutions

| Priority | Action | Solution and acceptance evidence | Status |
|---|---|---|---|
| P0 | Make verification repeatable | `npm run verify` runs the same gate locally and in CI: type baseline, hooks, rules, coordinates, anchors, unit tests, build, bundle budget. Checker crashes fail the gate. | Implemented; see verification below |
| P0 | Finish the existing save/draft batch | Review the save/draft work; exercise failed saves, retry, navigation, creator resume and account switching in the local app. Preserve pending edits. | Desktop/mobile local-browser login, draft reload/resume/discard and failed-save navigation/retry pass. Account isolation remains covered by unit tests; full two-account live playthrough pending. |
| P0 | Eliminate account-loading dead ends | Test missing profile, expired session, unavailable backend and sign-out without a profile. Add bounded profile requests, explicit recovery and stale-response protection where tests expose failures. | Implemented and mock-tested: 12-second profile deadline, stale-response protection, session-event precedence, Settings retry/sign-out without a profile. Hosted expired-session playthrough remains pending. |
| P0 | Certify database reproducibility | Rebuild a disposable local DB; compare columns, CHECK/FK constraints, policies, grants, functions and triggers against hosted test. Record named differences, fix through new migrations and repeat. | Pending; earlier column-only comparison did not certify the schema |
| P0 | Resolve historical combat constraint drift | Recheck the six creature/monster/npc constraints against current migrations and hosted schema. If still divergent, add a convergence migration with data checks and fresh-chain tests; do not infer current state from the August local patch. | Confirmed on hosted prod/test September 16. Compatibility migration accepts both vocabularies without rewriting rows; local apply and all six expression assertions pass. Hosted apply tracked below. Full fresh-chain certification remains separate. |
| P0 | Prove invite-to-play end to end | Two separate accounts: invite, set password, sign in, create/join campaign, assign character, complete a turn, reconnect, sign out and reset password. Repeat core player actions on mobile. | Pending |
| P0 | Verify release configuration | Confirm hosted test/Preview isolation, invite-only Auth configuration, redirect URLs, beta limits, billing disabled, support/invite contact and telemetry. Use configuration evidence, not a successful build, as proof. | Hosted state not checked in this batch |
| P1 | Make delivery predictable | Review deploy.bat and watcher paths; require the common gate before publishing, avoid blanket staging, document rollback and test it on Preview. | Vercel now runs `npm ci` + `npm run verify`, so publication requires the same gate as CI. This release uses explicit commits + PR. Legacy deploy.bat blanket staging and watcher retirement remain open. |
| P1 | Reduce carried debt | Fix TypeScript errors in focused groups and ratchet CI's baseline down. Audit dependencies and update in small tested batches. | Baseline currently 221; dependency review pending |
| Later | Paid/public release | Revisit billing fulfillment, source-content review, privacy/terms/support, capacity and recovery evidence before enabling the store or expanding access. | Deferred beyond invite-only beta |

## Daily workflow

1. Review the working tree and choose one acceptance criterion above.
2. Implement with focused regression coverage; use local Docker for DB work.
3. Run `npm run verify`. It does not reset databases or deploy. The build
   synchronizes the service-worker version and writes `dist/`.
4. Review the diff, including generated changes, and stage only the intended batch.
5. Submit through a PR; verify hosted-test behavior before production release.

CI owns `TS_BASELINE`; the local runner reads it rather than maintaining a second
allowance. Existing style errors remain debt, but hook violations, parser failures
and checker startup failures block verification.

## Verification record

September 16: full gate passed: TypeScript 221/221 with no TS2304, clean hooks,
RAW/coordinate/anchor suites, unit tests, production build and bundle budget
(largest checked entry 252.1 KB / 300 KB). Five additional runner tests pass,
covering carried debt, tool crashes, malformed/empty lint results, missing names,
excess diagnostics, hook/parser failures and downstream suite failures.
The initial sandboxed run failed on temporary-directory access; rerunning with
that access allowed passed. Current checkout includes the September 10 UX batch;
results cover that combined working tree. No production configuration, database
writes or deployment performed.

A passing gate is necessary, not sufficient: the live acceptance rows above must
have evidence before calling the beta ready. Update statuses when verified rather
than copying earlier session claims.

Account-recovery follow-up: eight new regressions pass (801 unit tests total).
Full gate passes at 221 type errors, no hook violations, largest entry 252.4 KB.
Desktop/393px recovery-panel screenshots checked with mocked auth/data, with no
browser exceptions. These checks do not authenticate against a live database.
Application/readiness batch committed as `fb00600`; auth recovery is a separate
follow-up. Machine-local agent instructions/toolkit were left untracked.

## v2.696 release validation

- Integrated main's v2.695 Spell Book navigation fix alongside the save queue.
- Started the existing local Docker DB without reset. Restored only the missing
  documented seed campaign; preserved accounts and character data.
- Six browser checks passed, desktop/mobile, using real local Auth and REST:
  login/campaign visibility, creator draft resume/discard, failed character PATCH
  with unchanged database HP, SPA navigation and successful explicit retry.
  Test cleanup restores the seed character's original HP.
- Migration `20260916181332_converge_combat_type_checks.sql` applied locally;
  `scripts/check-combat-constraints.sql` verifies every supported value and rejects
  an invalid value in each of the six actual CHECK expressions.
- Run recovery tests with `E2E_DB=1` and `--workers=1` because both viewports use
  the same seed character. Hosted rollout result is recorded after verification.

Rollback: retain the previous successful Vercel deployment and promote it if the
app smoke fails. The compatibility migration is additive to accepted values and
supports old and new clients; do not remove it or rewrite its ledger entry during
an app rollback. Any later narrowing needs a separate data audit and migration.
