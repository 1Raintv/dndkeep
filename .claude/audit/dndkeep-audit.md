# DNDKeep — Architecture Audit

> **STATUS ADDENDUM — 2026-08-03 (branch `audit-fixes`).** The audit below is
> the original 2026-08 report. This table records what has since been fixed,
> partially fixed, or remains open. Keep it current when working items.

| Finding | Status | Where |
|---|---|---|
| 1.1–1.7 Security | **Deferred by design** | Go-live checklist (companion doc) — app not yet live; 1.4 share-token RLS queued as owner decision #7 below |
| 1.6 Dice-overlay XSS | **Done** (CSP follow-up open) | `rollLabelNode()` textContent + jsdom regression test; checklist §1.4 |
| 2.1 One-machine deploy paths | **Done** | deploy.bat/lint.bat use %~dp0 |
| 2.2 CI as a gate | **Improved** | CI: tsc baseline (ratcheted 267→222) + hooks + build + 104 unit tests + bundle budget. deploy.bat still bypasses it — open |
| 2.3 Second deploy path / watcher | **Open** | |
| 2.4 Staging environment | **Open** | Local DB (2.5) is the stepping stone |
| 2.5 Local Docker database | **Done** | supabase start + db reset + seed; drift shims; docs/LOCAL_DEV.md |
| 2.6 Migration drift | **Reconstructed locally** | 4 drift shims (censused vs generated types). Certified prod schema dump still open — needs prod DB password |
| 2.7 Test framework | **Done** | vitest (104 tests) + Playwright (14 incl. DB flows) + visual baselines |
| 2.8 Error telemetry | **Done** (client) | log facade + Supabase sink → client_errors; prod table pending migration apply (owner queue); checklist §1.9 |
| 2.9 Manual version bump | **Open** | |
| 2.10 Repo hygiene | **Done** | .gitignore, artifacts untracked |
| 3.1 Dropped-table write | **Done** | Dead code removed (audit A1) |
| 3.2 Five dice implementations | **Done** | src/rules/dice.ts canonical; fixed "2d4+2 rolls 0" bug |
| 3.3 Damage math ×4 (actually ×7) | **Done** | src/rules/hp.ts; concentration DC unified (ceil bug + missing caps) |
| 3.4 Unchecked DB writes (~38%) | **Done** | `checkedWrite` seam (src/lib/api/checked.ts) routes failures → telemetry. 71 sites across 4 slices: combat (21), chat/social (11), character sheet (14), campaign mgmt (25). Stragglers: wrap writes you touch (CODING_STANDARDS.md) |
| 3.5 Stale generated types | **Open** | Needs prod access to regenerate |
| 3.6 TS gate depth | **Improved** | Baseline single-sourced + ratcheted; still threshold-based |
| 4.1 BattleMapV2 11,374 lines | **Done** | Root now 4,269; 15 components in battlemap/ (chunk byte-identical) |
| 4.2 Stale root duplicates | **Done** | Deleted (audit A1) |
| 4.3 ~8,000 lines dead code | **Done** | Deleted (A1/A2/A3) |
| 4.4 abilityModifier ×83 | **Done** | Canonical `abilityModifier()` in src/rules/abilities.ts (+tests); 54 inline formulas swept across 21 files; gameUtils re-exports for its 19 existing importers |
| 4.5 Repository layer | **Ongoing** | Convention documented in CLAUDE.md; extend as touched |
| 4.6 State management split | **Done** | Net-first (12 pins + useCombat contract test + combat lifecycle E2E), then: (1) combat state → scoped Zustand store behind unchanged useCombat(); (2) identity-reconciled refreshes (no-op tick → zero re-renders) + useCombatSelector/useCombatCurrentActor, 3 exemplar consumers (rest as touched); (3) lib→store inversion: 10 of 13 were type-only → domain types extracted to map/mapTypes.ts; startCombatFromMap fully inverted (snapshot injected, unit-tested); loadActiveBattleMap got an injectable seam (guarded store fallback kept deliberately — 8+ callers, v2.571 design). Suite: 160 unit + 10 db-tier E2E |
| 5.1 three.js never disposed | **Done** | Full GPU disposal + texture cache reuse |
| 5.2 Pixi textures never unloaded | **Done** | Scene backgrounds unloaded (portraits deliberately kept — shared) |
| 5.3 Dice-roller races | **Done** | Per-roll key + backstop timeout |
| 5.4 Chunk-retry bypassed | **Done** | lazyWithRetry everywhere (17 components); generic fixed |
| 5.5 Combat outside error boundary | **Done** | Own boundary |
| 5.6 Smaller robustness | **Done** | Idle timers gated; concentration timer cleared; provider values memoized (×5); useMonsters error path + retry fixed; ErrorBoundary @ts-nocheck removed; houseRules parse test-pinned; memo boundary: battleMapProps useMemo + React.memo(BattleMapV2) — realtime ticks no longer re-render the map tree (verified: 7 db-tier E2E). Stale items recorded |
| 6.1 655 KB entry-chunk data | **Done** | 848→~252 KB; CI budget guards it |
| 6.2 Drag writes at pointer rate | **Done** | rAF-coalesced (selector narrowing = follow-up) |
| 6.3 Spell re-filter per keystroke | **Done** | Memoized + Set |
| 6.4 Per-row combat writes | **Done** | Concurrent batched |
| 6.5 Profile blocks first paint | **Done** | Async + profileLoading (upsell-flash guarded) |
| 6.6 Realtime channels | **Done** | Filtered sub + shared refcounted channel |
| 6.7 Smaller perf items | **Partial** | The big one (memo boundary into BattleMapV2) done with 5.6. Deliberately deferred: 513 inline-style hoists (payoff only after memo proves out), self-hosted fonts, capping the three session-cached catalogue reads |

**Pending owner decisions (queue for when both devs are together):**

1. **Delete the auto-deploy watcher** (`watch-and-deploy.ps1`, `install-watcher.bat`,
   `uninstall-watcher.bat`) — audit §2.3. It watches Downloads for `dndkeep.zip` and
   auto-pushes to production, bypassing git/CI/the gate. Sequence: owner runs
   `uninstall-watcher.bat` on his machine FIRST (scheduled task), then delete from repo.
2. **Delete or rewrite `setup.js`** — it writes PROD credentials into `.env.local`
   (which now silently flips a local-DB machine back to production) and ends with
   `npx vercel --yes --prod` (setup = instant prod deploy). Superseded by
   docs/LOCAL_DEV.md; a rewritten bootstrap should target `.env` and never deploy.
3. **Refresh `DEPLOYMENT.md`** (keep it) — says 112 migrations (now 151), warns against
   the schema.sql that's since been rehabilitated as the shimmed baseline, predates
   LOCAL_DEV.md. Consider moving the deploy-script family to `tools/` at the same time
   (deploy.bat move needs the owner's muscle-memory sign-off or a root shim).
4. **`src/lib/map/mapRenderer.ts`** — kept during the dead-code pass pending the
   owner's call (unwired renderer-abstraction WIP: adopt or drop).
5. **Regenerate `src/types/supabase.ts` + certified prod schema dump** (§3.5/§2.6) —
   needs the prod DB password; also certifies the local drift shims.
6. **Node version: pick one, pin it everywhere** — owner's machine (version TBD),
   Kyle's 24, CI 20 (GitHub is deprecating Node 20 runners). Decide 22 LTS vs 24,
   then one commit: `.nvmrc` + package.json `engines` + ci.yml
   `node-version-file: .nvmrc`. Motivation beyond unpinning Playwright/vitest:
   the 2026-08-04 CI failure (jsdom/undici broke on CI's 20, invisible on local
   24) is the class this eliminates — environment skew can't be tested away,
   only aligned away.
7. **CI/CD cost tune-up** (proposed 2026-08-04) — one ci.yml commit: drop the
   `pull_request` trigger (push + PR events double-run every PR-branch push); add a
   `concurrency` group with cancel-in-progress; `timeout-minutes: 15` (default is 6 h);
   `paths-ignore` for `**.md`/`docs/**`/`.claude/**`; scope the daily cron to
   `raw-check` only. Owner-side: Vercel "Ignored Build Step" for docs-only pushes.
   While in there: add a migration-apply job (`supabase db push` on main) so future
   schema changes (client_errors, 1.4 policy fix) reach prod automatically — needs
   the prod DB password as a repo secret (same credential as the schema-dump item).
   **Prereq:** one-time `supabase migration repair` to baseline prod's
   schema_migrations ledger (prod predates most migration files — an unbaselined
   push would try to replay the entire chain). Convention going forward: new
   migrations written idempotent (IF NOT EXISTS) as defense-in-depth.
8. **Logging strategy** (proposed 2026-08-04) — 254 raw `console.*` calls across 65
   files, no levels, no central module. Proposal: small `src/lib/log.ts`
   (debug/info/warn/error), debug gated out of prod, error level feeding the 2.8
   telemetry sink; migrate call sites as files are touched. App-wide convention →
   owner buy-in first.
9. **Owner's dev DB choice** (2026-08-04) — does he move his machine to the local
   Docker DB (per-machine, reversible: `.env.local`; see docs/LOCAL_DEV.md and the
   `/setup-local-dndkeep` walkthrough) or keep developing against prod as he always
   has? His answer shapes the migration-workflow decisions (item 7) and whether
   dashboard-first schema editing continues.
10. **Automate the version bump (2.9)** (moved here 2026-08-05 — deploy.bat is the
    owner's script; he gets a heads-up before its behavior changes). Ready design:
    `scripts/bump-version.mjs` increments APP_VERSION's middle number; deploy.bat
    runs it as step 0 (sw-cache stamp then picks it up); `SKIP_BUMP=1` escape.
    Fixes: forgotten bump = unchanged sw cache name = returning users silently
    keep the old app. Also decide: comment-version drift (comments cite v2.642,
    version.ts says 2.635.0) — reunify or accept.
11. **Apply the telemetry migrations to prod** (2026-08-04) — Dashboard → SQL Editor,
    paste in order: `20260804120000_client_errors.sql` then
    `20260804160000_client_errors_retention.sql` (both idempotent). Verify:
    `select count(*) from public.client_errors;` and the `cron.job` row
    `client_errors_retention` (empty → enable pg_cron extension, re-run file 2).
    Rows flow once `audit-fixes` deploys; schema-first is fine by design. Include
    both files in the future `migration repair` baseline (manual applies don't
    write the ledger). Consider inviting Kyle to the Supabase org.
12. **Fix 1.4 share-token RLS together** (moved here 2026-08-04 — it needs a migration
   applied to prod, so do it as a pair). Agreed design: drop the `"Public share read"`
   policy; add a `SECURITY DEFINER get_shared_character(token)` function (`REVOKE ALL
   FROM PUBLIC`, `GRANT EXECUTE TO anon, authenticated` — same pattern as
   `join_campaign_by_code`) returning an explicit column list that excludes `user_id`;
   swap `SharePage.tsx` to the RPC; prove both directions with a DB-tier E2E.

**Added beyond the audit:** repo CLAUDE.md; unit-test convention; Playwright
harness + committed visual baselines + gated DB-backed E2E; local Supabase
with deterministic seed; docs/LOCAL_DEV.md; this .claude/ toolkit;
pixi manualChunks split; In Lair toggle (owner-approved during dead-code
triage); Vite watcher ignores for VS coexistence; supabase CLI as devDep.

---


**Repo:** `dndkeep` · v2.635.0 · ~122,000 lines across 290 source files · Vite + React 19 + PixiJS 8 + three.js + Supabase + Stripe, deployed on Vercel.

**Method:** six parallel audits — code structure, data layer, security, deploy & environments, runtime robustness, performance. Every finding below carries a file and line reference. The four highest-severity security items were independently re-verified by hand.

**How to read the ratings.** *Importance* is what happens if this is never fixed. *Effort* is XS (under an hour), S (a few hours), M (days), L (a week or more). The recommended sequence at the end is ordered by importance-per-hour, not by severity alone.

**Companion document:** the app isn't live or charging yet, so items that are deliberate testing conveniences are tracked separately in the **go-live checklist** — each with its fix, its dev-affordance replacement, and a way to verify it's actually done.

---

## The short version

This is a genuinely impressive application. 402 spells, real-time multiplayer combat, a PixiJS battle map with fog of war and vision, 2024 PHB rules automation — built by one person. Several things are done *better* than in codebases I'd expect from experienced teams: all 17 routes are code-split, the heavy 3D and map bundles are route-deferred, async cancellation discipline is consistent across 40+ call sites, campaign-level row-level security is soundly modelled, and the three hand-rolled regression scripts are precisely targeted at bug classes that had bitten before.

The problems cluster into three groups, and they're the predictable shape of AI-assisted solo development:

1. **Security gaps around money and account access.** Several of these are deliberate testing conveniences — the app isn't taking payments yet (Stripe is in test mode with placeholder keys), so they're **deferred to a go-live checklist** rather than treated as fires. See the companion document. A few are not conveniences at all, just unfinished, and cost nothing to do properly.
2. **No safety net.** No staging environment, no local database, no test framework, no error telemetry, and a CI pipeline that runs *after* production is already live. Nothing catches a mistake before users do.
3. **Accumulated ambiguity.** Duplicate and stale files, dead code paths, five different dice-rolling implementations that disagree with each other. This matters more than usual here, because ambiguity is exactly what causes an AI assistant to edit the wrong file or reimplement something that already exists — which then creates more ambiguity.

Group 2 is what stops the codebase getting worse, and it's where the immediate work is. Group 3 is the long tail. Group 1 is gated to launch, with the exception of a couple of items noted below.

---

## 1. Security — deferred to launch, with two exceptions

> **Status: mostly deferred.** The app isn't live to real users and isn't charging anyone — `.env.production` carries `pk_test_placeholder` / `price_placeholder`. Several findings below are *deliberate testing conveniences*, and they're tracked as gates in the **go-live checklist** rather than as immediate work.
>
> Severity ratings are unchanged, because they describe impact **if shipped as-is**. What's changed is the timing.
>
> Three things worth separating:
>
> - **Genuine conveniences** (1.1, 1.3) — they exist to skip Stripe. Defer, but replace with a dev affordance rather than reinstating them later. Table at the end of the checklist.
> - **Not conveniences, just unfinished** (1.2, 1.6, 1.7) — doing these properly is the same work or less. The edge-function fix is ~4 lines, and the client already sends the auth header correctly in `buy-character-slots`. No reason to wait.
> - **Worth doing now regardless** (1.4) — if any real character data exists today, it's anonymously dumpable today. Thirty minutes.
>
> One item deserves emphasis: **the workarounds are hiding a genuinely broken path.** One-time purchase fulfillment doesn't work at all (1.5). Because the client-side grants paper over it, nothing currently exercises the real flow — so it would be discovered on launch day with a real customer. Switching to Stripe test mode surfaces it now instead.



### 1.1 Any logged-in user can grant themselves every paid feature
**Importance: Critical · Effort: XS (~1 hour)**

`supabase/schema.sql:158`
```sql
create policy "profiles: own row update"
  on profiles for update using (auth.uid() = id);
```

No column restriction, no `WITH CHECK`, no guarding trigger — and I confirmed no later migration amends it. Every entitlement lives on that row: `subscription_tier`, `subscription_status`, `ultimate_campaign`, `extra_campaign_slots`, `extra_character_slots`.

A single PATCH request with the public anon key unlocks the entire paid product. It also defeats the server-side gates, because `enforce_campaign_pro_gate` and `enforce_character_limit` both read `subscription_tier` from this same row. And because `stripe_customer_id` is writable too, a user can point their row at someone else's Stripe customer.

**Fix:** `REVOKE UPDATE` on the billing columns from `authenticated`, plus a `BEFORE UPDATE` trigger that rejects changes to them from anything other than the service role.

**Also:** audit for users who have already done this — look for `subscription_tier = 'pro'` with a null `stripe_subscription_id`.

### 1.2 Billing-account takeover via unauthenticated edge function
**Importance: Critical · Effort: S (~2 hours for all three functions)**

`supabase/functions/create-portal-session/index.ts:28`

The function creates a **service-role** Supabase client, then takes `user_id` from the request body. It never reads the `Authorization` header; `auth.getUser()` appears nowhere in the file. Supabase's default JWT gate doesn't help, because the public anon key is itself a valid JWT.

Passing another user's UUID returns a **live Stripe billing portal URL for their account** — cancel their subscription, read invoices including billing address and card last-four, change the payment method. UUIDs are obtainable from two other findings below (1.4 and 3.4).

`create-checkout/index.ts:28` has the identical flaw, allowing an attacker to overwrite any user's `stripe_customer_id`.

Both also set `Access-Control-Allow-Origin: '*'`, so this is exploitable drive-by from any web page.

**Fix:** read the `Authorization` header, call `supabase.auth.getUser(jwt)`, use `user.id`, ignore the body field entirely. Pin CORS to the app origin.

### 1.3 Paid character slots granted from a URL parameter
**Importance: Critical · Effort: XS (~1 hour, but see below)**

`src/components/pages/SettingsPage.tsx:28-34`

Visiting `/settings?slots_purchased=9` grants nine character slots at $5 each. No Stripe session verification, and it's repeatable — each visit adds more. The cap in `src/lib/entitlements.ts:54` is applied at read time only, never on write.

The same shape exists for dice cosmetics: `dice_skin_unlocks` has an INSERT policy checking only `auth.uid() = user_id`, leaving `skin_id` unconstrained, so any user can insert any paid skin (`supabase/migrations/20260411002552_dice_skins.sql:26`).

**Important caveat:** these client-side grants exist because **server-side fulfillment for one-time purchases is broken** (see 1.5). Deleting them without fixing fulfillment will break real purchases. Pair the two changes.

### 1.4 Every shared character sheet is readable without its token
**Importance: High · Effort: XS (~30 min)**

`supabase/migrations/20260331024419_shareable_character_sheets.sql:22`
```sql
CREATE POLICY "Public share read" ON characters FOR SELECT USING (share_enabled = true);
```

No `TO` clause, so it applies to anonymous users, and the policy never references `share_token` — the token is only a client-side filter in `SharePage.tsx`. A single unauthenticated request dumps every shared sheet in the database: names, backstory, notes, personality traits, bonds, flaws, and `user_id`. That last column is the UUID list that makes 1.2 easy to exploit.

**Fix:** enforce the token in the policy, or move share reads behind a `SECURITY DEFINER` function that takes the token as an argument.

### 1.5 One-time purchases have no working server-side fulfillment
**Importance: High · Effort: M (~1 day)**

Three separate breaks in the same path:
- `create-checkout/index.ts:62` hardcodes `mode: 'subscription'` and discards the `mode` and `product_key` the client sends — so every one-time product checks out in subscription mode.
- `stripe-webhook/index.ts:42-64` handles `checkout.session.completed` by unconditionally setting `subscription_tier: 'pro'`, then calls `stripe.subscriptions.retrieve(session.subscription)`. For a one-time payment that field is null, so it throws and returns 500. It never reads `product_key`.
- Net effect: a $2 dice-dye purchase either fails outright or silently grants full Pro.

There's also **no idempotency protection** — no processed-event table, no `event.id` dedupe. Stripe retries on any non-2xx, and the 500 path guarantees retries.

Signature verification itself is correct.

### 1.6 Stored cross-user XSS in the dice overlay
**Importance: High · Effort: S (~2 hours)**

`src/components/DiceRoller3D.tsx:719,727` interpolate a label into `innerHTML` with no escaping. Labels are built from user-controlled names — including, at `src/components/Campaign/ChecksPanel.tsx:69`, *another player's* character name.

A player names their character with an image tag carrying an `onerror` handler; the DM rolls a secret check; it executes in the DM's browser. Supabase persists the session JWT in `localStorage`, so the payload can exfiltrate the DM's token.

**Fix:** build those nodes with `textContent` or JSX. Adding a Content-Security-Policy header in `vercel.json` would provide defense in depth (there currently isn't one).

### 1.7 Lower-severity security items
**Importance: Medium · Effort: XS each**

- `get_campaign_by_code` is `SECURITY DEFINER` with no `REVOKE ... FROM PUBLIC`, so anonymous callers can enumerate campaigns and harvest `owner_id` UUIDs. Join codes use non-cryptographic `random()` over ~1.07e9 possibilities (`20260330124930_add_campaign_join_code.sql:76`). The newer `join_campaign_by_code` revokes correctly — this is an inconsistency, not a pattern.
- The `battlemap-assets` bucket is flagged public, and its INSERT policy checks only `bucket_id` — no folder-ownership predicate, unlike UPDATE and DELETE. Any authenticated user can write into any other user's folder (`20260424161240_v2_215_battlemap_assets_bucket.sql`).
- Three deployed edge functions (`buy-character-slots`, `buy-dice-skin`, `discord-bot`) are **not in version control** and therefore cannot be audited. They handle money.

### What's clean
No secrets are committed anywhere — I checked git history across all branches. Stripe webhook signature verification is correct. Auth is stock Supabase with no hand-rolled token handling. And the campaign-scoped RLS model is genuinely well built: combat, scenes, tokens, walls, chat and the pending-action tables consistently scope to campaign membership, the recursion fix via `SECURITY DEFINER` helpers is sound, DM-hidden data is properly filtered, and **a player cannot read or write another campaign's data**. The exposures above are specific holes, not a broken model.

---

## 2. Environments, deployment and safety net

This is the group that determines whether the codebase gets better or worse from here.

### 2.1 Only one machine can deploy this app
**Importance: Critical · Effort: XS (~40 min for all of it)**

- `deploy.bat:14` and `lint.bat:22` hardcode `cd /d "C:\dev\DNDKeep"` — a directory that doesn't exist on this machine. The tooling references **four mutually inconsistent project paths** across four files, including one under a different Windows user account.
- `deploy.lock` is committed to git *while held*. A fresh clone therefore has a lock file with a recent timestamp, so `deploy.bat` immediately aborts with "another deploy appears to be running" — for 30 minutes, until someone knows to delete it.
- `.claude/worktrees/*` are committed as mode-160000 gitlinks with no `.gitmodules`, which breaks recursive clones.

**Fix:** `cd /d "%~dp0"` in both batch files; gitignore and un-track `deploy.lock` and `deploy-log.txt`; remove the stray gitlinks.

### 2.2 CI runs after production is already live
**Importance: Critical · Effort: S (1–2 hours)**

`.github/workflows/ci.yml` triggers on push. Vercel's Git integration builds on that *same* push, with no `ignoreCommand` and no deployment protection. Verified against the actual run for v2.635.0: CI started after Vercel had already begun building.

So the three regression scripts, the hooks check and the full TypeScript baseline check all run **after** users have the build. The only genuine pre-production gate is a local `findstr` for one error code (`TS2304`) inside `deploy.bat`.

**Fix:** enable Vercel's "wait for CI" / deployment protection, or move to `vercel build && vercel deploy --prebuilt` inside the Actions job.

### 2.3 A second deploy path bypasses every check
**Importance: Critical · Effort: XS (~10 min)**

`watch-and-deploy.ps1` extracts `~/Downloads/dndkeep.zip` into the project and pushes straight to main: no type check, no build, **no version bump and no service-worker cache-name bump**. `install-watcher.bat` registers it as a hidden scheduled task at logon.

Because it skips the `sw.js` cache-name bump, a deploy through this path ships new bundle hashes while the service worker still advertises the old cache — so the update-detection mechanism never fires and clients stay on a stale shell. `uninstall-watcher.bat` says "deploy.bat is now the only deploy path", so this was meant to be retired but is still installed and functional.

### 2.4 No staging environment; local development writes to the production database
**Importance: High · Effort: M (4–8 hours)**

`.env` and `.env.production` point at the **same** Supabase project. `npm run dev` reads and writes live user data — the only isolation is a convention of using a test campaign inside production.

This is the root cause behind several other findings. There is nowhere to safely test a migration, reproduce a bug, or verify a fix.

### 2.5 Local Docker database — close, but not usable today
**Importance: High · Effort: S (2–4 hours)**

You asked about this specifically. The pieces are mostly there:

- ✅ Docker is installed on this machine.
- ✅ All 147 migrations were statically verified as replayable — no forward references, no post-drop references, correct sort order, and the only extension needed (`pg_net`) ships in the Supabase image.
- ✅ Seed SQL for spells exists in `supabase/seed/` (8 chunks).
- ❌ `supabase/config.toml` has **no `project_id` key**, which the CLI requires — `supabase start` will error.
- ❌ The Supabase CLI isn't installed.
- ❌ There's no `supabase/seed.sql` and no `[db.seed]` block, so `supabase db reset` runs migrations and stops. The seed chunks are never wired in.
- ❌ Config is pre-1.x style and likely needs regenerating against the current CLI.

**Fix:** install the CLI, `supabase init` to regenerate config, add `project_id`, concatenate the seed chunks into `supabase/seed.sql`. That gets a real local database with real data, which in turn unblocks testing, migration verification and safe experimentation.

Note the monster and magic-item tables would still be empty — that seed data lives only in production. Worth a one-time export.

### 2.6 Migrations are applied to production out-of-band
**Importance: High · Effort: S (1 hour for a smoke test, 4–6 for drift detection)**

There is no `supabase db push` or `db diff` anywhere in the deploy script or CI. Migrations are applied directly to production (the README documents doing this via MCP), then back-filled into the repo afterwards. `docs/MIGRATION_DRIFT_CLEANUP.md` describes an entire arc spent recovering from exactly this — and the doc is now itself 35 migrations stale, claiming 112 when there are 147.

The same drift can silently recur, with no automated detection.

### 2.7 No test framework
**Importance: Medium · Effort: M (1 day to establish, ongoing to grow)**

No Vitest, Jest, Playwright or Testing Library. Zero test files. The three custom scripts (`raw-check`, `coords-check`, `anchor-check`) are genuinely well-aimed — they assert D&D rules-as-written values and guard grid-math invariants that caused real regressions — but they cover only static data and coordinate maths.

Untested: every React component, all Supabase queries, all RLS policies, auth, Stripe, the combat state machine, realtime sync. That is essentially the entire runtime surface.

Also: `esbuild` is imported by all three scripts but isn't declared in `package.json` — it resolves only as a transitive Vite dependency, so a Vite upgrade silently breaks the whole suite. That's a two-minute fix.

### 2.8 No error telemetry
**Importance: Medium · Effort: S (~1 hour for basic coverage)**

No Sentry, no `window.onerror`, no `unhandledrejection` handler. 194 `console.error` calls that nobody will ever see. In an app that is heavily promise-driven with 50 realtime channels and many fire-and-forget writes, production failures are currently invisible.

### 2.9 Version bumping is manual and load-bearing
**Importance: High · Effort: XS (~30 min)**

Nothing writes `src/version.ts` — `deploy.bat` only reads it. The bump arrives by hand inside the delivered bundle. Forgetting it ships a build whose service-worker cache name is unchanged, which silently no-ops the entire update path for every user.

### 2.10 Repository hygiene
**Importance: Medium · Effort: XS (~45 min)**

`.gitignore` misses `.vs/`, `.claude/`, `.vercel/`, `*.tmp`, and the deploy lock/log. Because `deploy.bat` runs `git add .`, anything untracked gets committed automatically. Already committed this way: a 133 KB `eslint-output.tmp`, a zero-byte `New Text Document.txt`, a 15 KB patch file applied 145 versions ago, and `.vercel/project.json` — whose own README says not to commit it.

*(One note on my own footprint: I created `.claude/launch.json` to start the dev server. It's untracked, so the next `deploy.bat` run would commit it. It's covered by the `.gitignore` fix above.)*

---

## 3. Correctness risks in the core game loop

These aren't security issues, but they're where silent wrongness lives — and two have already shipped bugs that the code's own comments document.

### 3.1 Writing to a table that was dropped four months ago
**Importance: Critical · Effort: S (1–2 days)**

`src/components/shared/InitiativeTracker.tsx:54,56,63` writes to `session_states`. That table was **dropped in v2.296** by two migrations. The component is live — imported by `SessionTab.tsx`.

Every initiative push fails against a nonexistent table. Nobody notices because the error is discarded and local state updates optimistically *before* the write, so the UI looks correct until reload — at which point the data is gone. This is silent data loss on a user-facing feature.

`src/lib/api/npcRoster.ts` has the same problem against the dropped `dm_npc_roster` table, but its consumers are dead code.

### 3.2 Five different dice-roll implementations that disagree
**Importance: High · Effort: M (2–3 days)**

Not copy-paste — behaviourally divergent forks in `gameUtils.ts:290`, `spellParser.ts:185`, `pendingAttack.ts:49`, `buffs.ts:284`, plus `rollD20` defined independently in two more files.

`buffs.rollDiceExpr` uses the regex `/^(\d+)d(\d+)$/`, so **any expression with a modifier silently returns zero** — a buff healing `2d4+2` heals nothing. `pendingAttack.rollDiceExpr` is the only one handling bare integers, and its own comment records that 19 creatures dealt zero damage until v2.448 because of exactly this fragmentation.

Separately, 29 sites across 18 files still call `Math.floor(Math.random() * …)` inline rather than using any helper at all.

These failures are near-invisible: a zero total looks like a miss, not a crash.

### 3.3 Damage application reimplemented four times
**Importance: High · Effort: M (2–3 days)**

The temp-HP-absorbs-first rule is hand-written independently in `PartyDashboard.tsx:1579`, `MonsterBrowser.tsx:101`, `buffs.ts:648` and `CharacterSheet/index.tsx:1212` — with different shapes. There is no `applyDamage()` anywhere in `src/lib`. `CharacterSheet/index.tsx:799` carries a comment about a past bug where one path "missed cases where damage was fully absorbed by temp HP" — so this duplication has already shipped a bug once.

This is the most-exercised write path in the application.

### 3.4 Roughly 38% of database writes cannot detect failure
**Importance: High · Effort: M (~3 days for the high-risk subset)**

Of 284 mutating Supabase operations, about 109 either discard the result entirely or destructure away the `error`. Combined with optimistic local state updates, failures are invisible until reload.

The highest-risk instances write to `characters`: DM edits to player sheets (`DMScreen.tsx:155`), HP and condition writes (`PartyDashboard.tsx:619`), and campaign join/leave (`CampaignDashboard.tsx:1244,1253`).

**Fix:** an `assertOk()` helper plus an ESLint rule banning bare `await supabase.from(`, then fix the ~25 `characters`/`campaigns` writes first.

### 3.5 Generated database types are 12 migrations stale
**Importance: High · Effort: XS for the regeneration (~half a day including fallout)**

`src/types/supabase.ts` was last generated at v2.493; the app is at v2.635. Seven columns and the entire `entitlements` table are missing. They were also produced by hand via SQL introspection rather than `supabase gen types`.

This is the direct cause of the `as any` explosion — **553 casts**, including 103 `(supabase as any)` — because any write touching a missing column has to bypass the type system. A well-designed helper for this already exists (`src/lib/jsonbCast.ts`) but is used at only two sites.

Regenerating is one command. It'll surface more errors initially, but they're errors that already exist.

### 3.6 The TypeScript gate checks one error code out of 267
**Importance: High · Effort: XS to tighten the gate, L to clear the backlog**

`deploy.bat` greps only for `TS2304`. There are 267 real errors under `strict: true`. About 90 are unused variables; the remaining ~177 are genuine type mismatches, and a handful are crash-class — arithmetic on possibly-null HP values in `SpellHealPickerModal.tsx:263`, for instance.

Separately, `npm run lint` is configured with `--max-warnings 0` against 782 existing problems, so **it can never pass**. 51 of those are `react-hooks/exhaustive-deps` — the stale-closure surface, and the repo has a documented history of dependency-array bugs blanking the map canvas.

The baseline is also stated as five different numbers across five files (267, 271, 271, 271, 306). The real figure is 267.

---

## 4. Structure and maintainability

### 4.1 BattleMapV2.tsx is 11,374 lines
**Importance: High · Effort: M for the mechanical win, L for the full job**

Fifteen components in one file. The root component alone is 3,897 lines with **42 `useState`, 79 `useEffect`, 67 `useRef`** — that's 79 independent subscription and lifecycle chains sharing one closure scope. `TokenLayer` is another 2,584 lines.

The good news: **the seams already exist.** Each `*Layer` is a self-contained, props-in Pixi component. Extracting the fourteen sub-components into their own files is two or three days of low-risk mechanical work and delivers most of the readability benefit. Decomposing the root's 79 effects into roughly six custom hooks is the remaining week.

### 4.2 Stale duplicate files at the repository root
**Importance: High (for AI-assisted work specifically) · Effort: XS (~15 min)**

`combatEncounter.ts`, `campaignImmunities.ts`, `version.ts`, `schema.sql`, `001_death_saves.sql` and `002_hit_dice.sql` all sit at the repo root as copies of files that live in `src/lib` or `supabase/`. They're git-tracked but **outside `tsconfig.json`'s `include`, so they never compile, lint or ship**.

The root `combatEncounter.ts` is 359 lines behind its live twin and missing entire subsystems. The root `version.ts` says 2.490.0 against a live 2.635.0. The root `schema.sql` is the pre-v2.296 version that still defines the dropped `session_states` table.

This is a grep trap. Searching for a function name returns the root copy, and editing "the file that matched" produces work that reaches no build. For an AI assistant this is a live foot-gun, not a theoretical one — and I'd argue it's the single highest-value cleanup in this entire report relative to the fifteen minutes it takes.

### 4.3 Roughly 8,000 lines of dead code
**Importance: Medium · Effort: S (~1 day)**

23 files that nothing imports, including a 1,072-line `NpcRosterBuilderModal.tsx` (the 12th-largest file in the repo). There are **three initiative-tracker implementations**, two reachable only through a dead file. An abandoned first-generation `SpellsTab` / `SpellCastButton` / `AoEBadge` trio shares filenames with their live successors, so every search for them is ambiguous.

There's also a half-finished renderer abstraction: `src/lib/map/mapRenderer.ts` has zero importers, its design document references a `PlayerBattleMap.tsx` that doesn't exist, and `BattleMapV2.tsx:7545` has a `useNewPath` flag hardcoded to `false` that gates a complete, unreachable second persistence path against a different database table — served by the largest file in `src/lib/api`.

Underlying all of these is one habit, stated explicitly in a comment at `CharacterSheet/index.tsx:109`: dead code is kept "so a re-add is one-line". **Trusting git history for undo instead is free, and it's the highest-leverage process change available here.**

### 4.4 The ability-modifier formula appears 83 times
**Importance: Medium · Effort: S (~1 day)**

`abilityModifier()` exists in `gameUtils.ts` and has three callers. Meanwhile `Math.floor((x - 10) / 2)` is written out 83 times across the codebase, and several files define a local helper identical to the library function. Variants have already drifted — some clamp, some null-coalesce, some do neither.

The formula is stable in 5e so this won't break; it's a signal that the library layer isn't discoverable to whoever is writing components.

### 4.5 No repository layer for the core domain
**Importance: Medium-High · Effort: L (incremental, 2–4 weeks)**

`src/lib/api/` is a proper data-access layer, but it covers only the battle-map slice — an artifact of when it was built. Characters, campaigns and combat have none, leaving **248 direct Supabase calls inside components**. Nine of the fourteen `api` files also swallow errors entirely.

Best done incrementally, one table at a time, using the existing `api` files as the template.

### 4.6 State management split by chronology, not concern
**Importance: Medium · Effort: M (3–5 days)**

Zustand holds exactly one store (the battle map); five React contexts hold everything else. The store's own header gives the correct rationale — selector-based subscriptions avoid re-rendering everything when one token moves — and that argument applies verbatim to `CombatContext`, which re-renders all twelve consumers whenever any participant's HP changes.

There's also an inverted dependency: five modules in `src/lib` import the UI store singleton directly, which will block unit-testing them.

---

## 5. Runtime robustness

### 5.1 three.js resources are never disposed; a new renderer per dice roll
**Importance: High · Effort: S (2–3 hours)**

`DiceRoller3D.tsx` constructs a **new `WebGLRenderer` on every roll** (line 436). Teardown calls `scene.clear()`, which detaches objects without disposing them, and `TC.clear()`, which drops `CanvasTexture` references without calling `.dispose()`. So every roll leaks geometries, materials and GPU textures.

Browsers cap live WebGL contexts at around 16. In a long combat session, expect "too many active WebGL contexts" and eventually a black dice overlay. In development, StrictMode double-mounting doubles the rate.

The correct disposal pattern already exists a few lines away for the spark meshes — it just isn't applied to the dice.

### 5.2 PixiJS textures are never unloaded
**Importance: High · Effort: S (1–2 hours)**

`Assets.unload` and `Assets.reset` appear nowhere. Scene backgrounds (full-resolution map images) and token portraits are loaded through the global asset cache, which persists for the tab's lifetime. Sprites get destroyed; the underlying GPU textures don't. A DM cycling through fifteen scenes accumulates fifteen full map textures in video memory permanently.

Needs light refcounting, since portraits are shared across tokens.

### 5.3 Two dice-roller races that can stall combat
**Importance: High · Effort: XS (~1 hour for both)**

- **Rapid rolls drop the second result.** The scene-construction effect has empty dependencies and the component is rendered without a `key`, so a second roll within 4.5 seconds re-renders the same instance without re-running the effect. The dice on screen stay the first roll's, and the second roll's `onResult` never fires. That's precisely the shape of an attack-then-damage chain.
- **The provider unmounts the roller before physics can settle.** The provider clears after 4,500 ms; the component's own force-settle deadline is 5,000 ms and dismissal is 5,500 ms. If dice haven't settled in time, `onResult` never fires and the combat pipeline stalls silently.

Both are small fixes with outsized reliability payoff.

### 5.4 Chunk-retry helper bypassed by the biggest chunks
**Importance: Medium · Effort: XS (~15 min)**

`src/lib/lazyWithRetry.ts` exists specifically to handle stale chunk hashes after a deploy — it retries three times and force-reloads once. It's wired into `App.tsx` only. All five nested lazy sites, including BattleMapV2 and the dice roller, use plain `React.lazy`.

So after a deploy, an open tab that opens the battle map hits a 404 with no retry and lands on the error boundary — the exact failure the helper was written to prevent. Five import lines.

### 5.5 Always-mounted combat components sit outside the error boundary
**Importance: Medium · Effort: XS (~20 min)**

`CampaignDashboard.tsx` closes its `ErrorBoundary` at line 1127, but `InitiativeStrip`, `MonsterActionPanel` (3,779 lines) and four realtime-driven modals are rendered *after* it. A throw in any of them — these being the components most likely to receive a malformed realtime payload — replaces the entire campaign page with a generic error screen.

Moving one closing tag fixes it.

### 5.6 Smaller robustness items
**Importance: Low-Medium · Effort: XS each**

- `useMonsters` swallows errors twice, making its own error state unreachable — a failed fetch renders as "no monsters" with no signal.
- No versioning or migration on persisted `localStorage` blobs. The `houseRules` blob is read raw and unvalidated deep inside the combat rules engine, so a shape change would feed wrong values into attack resolution rather than failing loudly.
- Four always-mounted modals run 4 Hz `setInterval` timers ungated by whether anything is pending — 8–12 renders per second burning battery on every campaign and character page.
- `ErrorBoundary.tsx` is the only `@ts-nocheck` file in `src`, which is an unfortunate choice for the component whose job is catching type-related crashes.
- One realtime channel leak, at `shared/InitiativeTracker.tsx:167`.
- **Zero `React.memo` in the codebase**, combined with `commonProps` being rebuilt from three `.map`/`.filter` chains and a fresh `Map` on every render of `CampaignDashboard` — then spread into the unmemoized 11,374-line BattleMapV2. Every realtime tick re-renders the entire map component tree. Memoizing that boundary is likely the single highest-leverage performance change available.
- Context provider values are unmemoized object literals containing function declarations, so all consumers re-render on every provider render. In one case (`MinionPanel`) this causes a refetch on every render.

### What's clean
No unused heavy dependencies. All version peer ranges are satisfied — no React 19 / PixiJS 8 mismatches, and the Pixi v8 async-init pattern is handled correctly with a comment explaining the bug it fixed. All seven `setInterval` calls are cleaned up; 65 of 66 event listeners are removed; 48 of 50 realtime channels are properly torn down. localStorage access is uniformly try/catch-wrapped. And the Zustand store is used with granular selectors throughout, exactly as its header comment intends.

---

---

## 6. Performance

Measured from a real production build: 68 chunks, 4.3 MB total, 7.5 seconds.

### 6.1 One import line pulls 655 KB of game data onto the landing page
**Importance: High · Effort: S (2–4 hours) — best value-per-hour in the report**

The entry chunk is **848 KB raw / 229 KB gzipped**, and roughly 77% of it is static game data that a logged-out visitor to the marketing page never touches. Confirmed by grepping the built artifact — spell names appear in the entry chunk and nowhere else.

The cause is a four-link import chain, and the first link is the whole story:

```
App.tsx:11        imports QuickRoll (eager — renders for every logged-in user)
QuickRoll.tsx:3   imports { rollDie } from lib/gameUtils   ← this is it
gameUtils.ts:3    imports CLASS_MAP from data/classes      (140 KB)
classes.ts:2      imports SPELL_MAP from data/spells       (483 KB)
```

`rollDie` is a wrapper around `Math.random()`. Importing that one function drags in the entire spell and class catalogue, plus magic items via a second branch through `attunement.ts`. None of it is tree-shakeable — they're record literals consumed by map lookups.

**Fix:** move `rollDie` into a leaf module with no imports, split the `SPELL_MAP` dependency out of `classes.ts` into a separate module that only spell-aware call sites import, and make the magic-item lookup lazy. Projected entry chunk afterwards: **~190 KB raw / ~60 KB gzipped**, roughly a 75% reduction.

On a 4G connection that's on the order of 1.5–2 seconds of avoidable transfer and parse before React mounts — on the page you're trying to convert visitors with. It also shrinks the visible flash of the inline SEO shell, since that window is currently wide *because* of this chunk.

The rest of the splitting setup is good: all 17 routes are lazy, three.js and cannon-es are correctly isolated and not preloaded, and PixiJS only loads on the map tab.

### 6.2 Token dragging writes to the store on every pointer event
**Importance: High · Effort: M (1–2 days)**

`BattleMapV2.tsx:5442` calls `updatePos` inside `onPointerMove` with no throttling or frame coalescing — so on a high-polling-rate mouse this fires around 240 times per second. The peer broadcast immediately below it *is* throttled to 50 ms; the local store write isn't.

Each call shallow-clones the entire tokens map (`battleMapStore.ts:431`). Three components subscribe to that whole map, so all three re-render at pointer rate. And one of them rebuilds a token-to-conditions Map from scratch on every change — at 50 tokens that's tens of thousands of Map operations per second of dragging.

This is the frame-drop during the single most-used interaction on the battle map.

**Fix:** coalesce the store write behind `requestAnimationFrame`. The codebase already does this correctly elsewhere — `BattleMapV2.tsx:9719` has the pattern with a comment explaining exactly this problem. Keep the dragged token's position in a ref, write on the frame tick, narrow the store selectors.

### 6.3 The character sheet re-filters 282 spells on every keystroke
**Importance: High · Effort: S (half a day)**

`CharacterSheet/index.tsx:1165-1184` runs three Set allocations, a filter with a nested `Array.includes` (quadratic), and two `localeCompare` sorts — unmemoized, in the render body. The component has **41 `useState` hooks**, so this re-runs on every HP keystroke, tab click and modal toggle. `localeCompare` is roughly 100× the cost of a plain string comparison.

The same shape appears twice more in the file. There are only two `useMemo` calls in 4,804 lines.

Result: typing in the HP field is visibly laggy for a spellcaster. Wrapping in `useMemo`, switching the lookup to a `Set`, and precomputing sort keys fixes it in an afternoon.

### 6.4 Per-row database updates on every combat round
**Importance: High · Effort: S**

`lib/buffDuration.ts:186-245` has three near-identical blocks that batch-read rows, then update them **one at a time in a loop**. This fires on every round tick. A six-player, twelve-monster encounter means up to 18 sequential round-trips before the "next turn" button responds.

Same pattern in `combatEncounter.ts:330,363` on combat start, and worse at `:520-535`, which does a `select('*')` per character against one of the widest tables in the schema.

`LivingNpcsList.tsx:128-165` already demonstrates the right approach — batched `.in()` queries with a first-wins Map. Copy that.

### 6.5 The profile fetch blocks first paint
**Importance: Medium-High · Effort: XS**

`AuthContext.tsx:83-89` resolves the session, **then** serially fetches the profile, and only clears `loading` after the second one. Nothing authenticated renders until both complete — and only then does the route's chunk start downloading, a third serial round-trip.

The profile payload is used for the Pro badge, display name and dice skin. None of that is needed to render the lobby, and consumers already tolerate a null profile.

**Fix:** clear `loading` when the session resolves and let the profile populate asynchronously. Saves roughly one round-trip (~150–400 ms on mobile) on every cold load.

### 6.6 Realtime channel count
**Importance: Medium · Effort: S**

A DM with the map tab open holds about **21 concurrent channels**; a five-player session totals around 61. Dashboard panels are correctly tab-gated, which keeps this from being worse.

Two easy wins: `PartyDashboard.tsx:207` subscribes to the `characters` table with **no filter** and responds by refetching the entire party — its sibling in `CampaignDashboard.tsx:262` already does this correctly with a filter and a delta apply. And `useCampaignConcentrations` is mounted twice with an instance-ID suffix, deliberately creating two channels carrying identical traffic.

About 21 handlers refetch entire tables where they could apply the payload delta. `CombatContext`'s three are hottest — every combat state change refetches the whole encounter for every connected client.

Worth noting the good patterns already present: `BattleMapV2.tsx:7813` has explicit echo suppression, `:7860` filters so HP ticks don't trigger token refetches, and `CombatEventLog.tsx:161` prepends the payload and slices rather than refetching.

### 6.7 Smaller performance items
**Importance: Low-Medium · Effort: XS each**

- `useSpells`, `useMonsters` and `useMagicItems` each read their full table with no limit — `monsters` includes 40 columns of jsonb. All three are session-cached, which mitigates it, but the spell one means the same catalogue is paid for twice: once in the bundle, once over the wire.
- Google Fonts loads three families as a render-blocking cross-origin stylesheet (`index.html:47`). Preconnect is present, but self-hosting would remove the blocking round-trip entirely.
- 513 inline `style={{...}}` literals across the four largest components mean adding `React.memo` won't help until those are hoisted.

### What's clean
Asset handling has no findings at all — `public/` totals 34 KB with no unoptimized images, and the cache headers in `vercel.json` correctly pair immutable long-lived caching with Vite's content hashes. The service worker is network-first and explicitly skips hashed chunks, Supabase and Stripe, so it isn't fighting the HTTP cache. Database indexes are in good shape — 69 index definitions including a dedicated catch-up migration. Chat and log queries are all capped.

---

## Recommended sequence

Ordered by value per hour, not by severity.

### This week — make the repo workable (about 1.5 days total)

| Do | Why | Effort |
|---|---|---|
| Fix `deploy.bat` paths, un-track `deploy.lock`, remove the watcher (2.1, 2.3) | Right now only one machine can deploy | 40 m |
| Delete the six stale root duplicates; fix `.gitignore` (4.2, 2.10) | Removes the wrong-file trap — biggest AI-assist win per minute | 1 h |
| Delete the ~8,000 lines of dead code (4.3) | Same reason; searching returns one answer | 1 d |
| Write a `CLAUDE.md` | Stops the fifth dice roller being written | 2 h |
| Enforce the share token in RLS (1.4) | Any existing character data is dumpable today | 30 m |

The first two are 100 minutes and disproportionately change how everything else feels.

### Next — the safety net (about a week)

**Local Docker database (2.5) first** — it's the enabler for nearly everything else, including every dev affordance that replaces a deferred security hole. Then staging (2.4), so there's somewhere to test a migration and reproduce a bug without touching production.

Then: make CI an actual gate (2.2). Regenerate the Supabase types (3.5) — one command that removes the reason hundreds of `as any` casts exist. Add error telemetry (2.8). Fix the `session_states` silent data loss (3.1).

### Then — the quick performance wins (about two days, mostly independent)

The entry-chunk import chain (6.1) is the standout: a few hours for a ~75% reduction in initial download. Then the character sheet memoization (6.3), the round-tick N+1 (6.4), the auth gate (6.5), and the two dice-roller races (5.3). Token drag coalescing (6.2) is a day or two and fixes the most-felt interaction on the map.

### Before launch — the go-live checklist

Everything in §1, plus the reliability items (paid Supabase with a *tested* restore, CI as a real gate, migration drift detection). Phased in the companion document: before real users, before taking money, before depending on it. Roughly two days, two days and a week respectively.

Worth starting Stripe test mode early rather than at the end — it's what reveals that one-time fulfillment is broken.

### Ongoing — the long tail

Consolidate dice rolling (3.2) and damage application (3.3) — both are active correctness risks with shipped-bug history. Extract the BattleMapV2 layers (4.1) — the first two or three days are low-risk mechanical work with most of the payoff. Add a test framework (2.7), starting with the game-logic modules in `src/lib` where the value is highest and the mocking burden lowest. Build out the repository layer (4.5) one table at a time as you touch each area.

---

## One process change worth more than any single fix

Four separate findings — the stale root duplicates, the abandoned component trio, the dead initiative trackers, the unreachable renderer path — are the same habit. A comment in `CharacterSheet/index.tsx:109` states it outright: dead code is kept "so a re-add is one-line."

Git already does that, better and for free. Deleting confidently and recovering from history when needed costs nothing and eliminates an entire category of problem. It matters more here than in a typical codebase, because ambiguity about which file is real is precisely what causes an AI assistant to edit the wrong one — which produces more dead code, which deepens the ambiguity.

Breaking that loop is the highest-leverage change available, and it takes an afternoon.

