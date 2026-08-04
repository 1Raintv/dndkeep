# DNDKeep — Go-Live Checklist

Everything here is **deliberately deferred**, not overlooked. These are items that are fine (or fine enough) while the app is a private build with Stripe in test mode, and that must be resolved before real users or real money.

Companion to the architecture audit. Each item states what it is, why it's safe to defer, the fix, and — importantly — **how to verify it's actually done**. A gate you can't verify is a memory, not a gate.

**Current status that makes deferral reasonable:** `.env.production` carries `pk_test_placeholder` / `price_placeholder`, so nothing is charging anyone. Confirm before launch that live Stripe keys are set in Vercel and *nowhere in the repo*.

---

## Phase 1 — Before any real users

Even a free, invite-only launch. These protect user data and accounts.

### 1.1 Lock down the `profiles` update policy
**Why deferred:** flipping your own tier is how you test paid features without Stripe.
**Risk if shipped:** any logged-in user grants themselves every paid feature with one request. Also defeats the server-side gates, which read the same column.

- `supabase/schema.sql:158` — policy is `using (auth.uid() = id)` with no column restriction and no `WITH CHECK`.
- **Fix:** `REVOKE UPDATE` on `subscription_tier`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `ultimate_campaign`, `extra_campaign_slots`, `extra_character_slots` from `authenticated`; add a `BEFORE UPDATE` trigger rejecting changes to those columns from anything but the service role.
- **Replace the convenience with:** seeded local accounts (one per tier) + a `VITE_DEV_TIER_OVERRIDE` read in `src/lib/entitlements.ts`, gated on `import.meta.env.DEV` so it cannot exist in a production build.
- **Verify:** as a normal logged-in user, `PATCH /rest/v1/profiles?id=eq.<own uid>` with `{"subscription_tier":"pro"}` → must fail. Then confirm the value is unchanged.

### 1.2 Authenticate the edge functions
**Why deferred:** trusting a body field lets you call them from curl without minting a JWT.
**Risk if shipped:** billing-account takeover — pass any user's UUID, get a live Stripe portal for their account (cancel subscription, read invoices with billing address and card last-four, change payment method).

- `supabase/functions/create-portal-session/index.ts:28` and `create-checkout/index.ts:28` — service-role client, `user_id` taken from the request body, `Authorization` header never read.
- **Fix:** read the header, `supabase.auth.getUser(jwt)`, use `user.id`, ignore the body field. Pin `Access-Control-Allow-Origin` to the app origin (currently `*` in both).
- **Replace the convenience with:** call via `supabase.functions.invoke()` from the app — it attaches the JWT automatically. `buy-character-slots` already does this correctly; copy that.
- **Verify:** call each function with a valid JWT but a *different* `user_id` in the body → must act on the JWT's user, not the body's. Call with no `Authorization` header → must 401.

### 1.3 Enforce the share token in RLS
**Why deferred:** not really a convenience — mostly an oversight.
**Risk if shipped:** every shared character sheet is anonymously readable without its token. Names, backstories, notes, personality traits, bonds, flaws, and `user_id`.

- `supabase/migrations/20260331024419_shareable_character_sheets.sql:22` — `USING (share_enabled = true)`, no `TO` clause, never references `share_token`. The token is only a client-side filter.
- **Fix:** enforce the token in the policy, or move share reads behind a `SECURITY DEFINER` function taking the token as an argument.
- **Verify:** anonymous `GET /rest/v1/characters?select=*` → must return zero rows. Then confirm a valid share link still loads.
- **Note:** worth doing now rather than at launch if any real character data already exists.

### 1.4 Escape user-controlled text in the dice overlay
**Why deferred:** `innerHTML` was the quick path.
**Risk if shipped:** stored XSS. A player names their character with an image tag carrying an `onerror` handler; the DM rolls a secret check; it executes in the DM's browser. Supabase keeps the session JWT in `localStorage`, so the payload can steal the DM's token.

- `src/components/DiceRoller3D.tsx:719,727` — labels interpolated into `innerHTML`. Cross-user path is `src/components/Campaign/ChecksPanel.tsx:69`.
- **Fix:** build those nodes with `textContent` or JSX. Add a Content-Security-Policy header in `vercel.json` (there isn't one) for defense in depth.
- **Verify:** create a character named `<img src=x onerror="alert(1)">`, roll a check on it from another account → renders as literal text, no alert.

### 1.5 Fix the storage bucket write policy
**Risk if shipped:** any authenticated user can write into any other user's asset folder.

- `supabase/migrations/20260424161240_v2_215_battlemap_assets_bucket.sql` — bucket flagged public; INSERT policy checks only `bucket_id`, with no folder-ownership predicate (UPDATE and DELETE both have one).
- **Fix:** add `(storage.foldername(name))[1] = auth.uid()::text` to INSERT; flip the bucket private.
- **Verify:** as user A, upload to a path prefixed with user B's UUID → must fail.

### 1.6 Revoke anonymous access to `get_campaign_by_code`
**Risk if shipped:** anonymous callers enumerate campaigns and harvest `owner_id` UUIDs — which is what makes 1.2 easy to exploit.

- `supabase/migrations/20260330124930_add_campaign_join_code.sql:76` — `SECURITY DEFINER` with no `REVOKE ... FROM PUBLIC`. The newer `join_campaign_by_code` revokes correctly; this is an inconsistency, not a pattern.
- **Fix:** `REVOKE ALL ... FROM PUBLIC, anon;`. Consider `gen_random_bytes` instead of `random()` for join codes.
- **Verify:** call the RPC with only the anon key → must be denied.

### 1.7 Stop the silent data loss in initiative tracking
**Risk if shipped:** a live feature loses user data on every use.

- `src/components/shared/InitiativeTracker.tsx:54,56,63` writes to `session_states`, dropped in v2.296. The error is discarded and local state updates optimistically, so it looks like it works until reload.
- **Fix:** rewire onto `combat_encounters` / `combat_participants`.
- **Verify:** push initiative, hard-reload, confirm it persisted.

### 1.8 Get the three missing edge functions into version control
**Risk if shipped:** `buy-character-slots`, `buy-dice-skin` and `discord-bot` are deployed and handle money, but aren't in the repo — so they cannot be reviewed at all.

- **Fix:** `supabase functions download` each, commit, then audit them against the same checklist as 1.2.
- **Verify:** `supabase/functions/` contains all six; each has been read.

### 1.9 Add error telemetry
**Risk if shipped:** you cannot operate a live service blind. There is no Sentry, no `window.onerror`, no `unhandledrejection` handler — and 194 `console.error` calls nobody will ever see.

- **Fix:** a basic reporter is about an hour. Given 50 realtime channels and many fire-and-forget writes, unhandled rejections are the ones that matter most.
- **Verify:** throw deliberately in a component and in a promise; confirm both arrive.

### 1.10 Fix the auth redirect placeholder
- `supabase/config.toml:25` — `additional_redirect_urls = ["https://your-app.vercel.app"]`, a literal placeholder.
- **Verify:** confirm the real production URL is set in the Supabase dashboard, and test password reset and email confirmation end-to-end on production.

---

## Phase 2 — Before taking money

Everything in Phase 1, plus:

### 2.1 Make one-time purchase fulfillment actually work
**This is the big one — the current workarounds are hiding a genuinely broken path.**

Three separate breaks:
- `create-checkout/index.ts:62` hardcodes `mode: 'subscription'` and discards the `mode` and `product_key` the client sends — so every one-time product checks out in subscription mode.
- `stripe-webhook/index.ts:42-64` unconditionally sets `subscription_tier: 'pro'` on `checkout.session.completed`, then calls `stripe.subscriptions.retrieve(session.subscription)`. For a one-time payment that's null → throws → 500. It never reads `product_key`.
- Net: a $2 dice-dye purchase either fails outright or silently grants full Pro.

**Fix:** route `product_key` → entitlement in the webhook; honour `mode` in checkout.
**Verify:** in Stripe **test mode** with card `4242 4242 4242 4242`, buy each of the six one-time products and confirm the correct entitlement lands and no Pro tier is granted. Use `stripe listen --forward-to` to exercise webhooks locally.

### 2.2 Add webhook idempotency
- No processed-event table, no `event.id` dedupe. Stripe retries on any non-2xx, and the 500 path in 2.1 guarantees retries.
- **Fix:** a `stripe_events(id primary key)` table, insert-or-skip.
- **Verify:** replay the same event twice via the Stripe CLI; entitlement must be credited once.

### 2.3 Remove the client-side entitlement grants
**Do this *with* 2.1, not before — separately, one breaks purchases and the other leaves the hole open.**

- `src/components/pages/SettingsPage.tsx:28-34` — grants slots from `?slots_purchased=`, no verification, repeatable.
- `supabase/migrations/20260411002552_dice_skins.sql:26` — `dice_skin_unlocks` INSERT policy leaves `skin_id` unconstrained, so any user can insert any paid skin.
- **Verify:** `/settings?slots_purchased=9` grants nothing. Direct insert into `dice_skin_unlocks` is denied.

### 2.4 Switch Stripe to live mode
- Replace the placeholders. Live keys go in the Vercel dashboard **only** — never in the repo, and note `.env.production` is committed.
- **Verify:** grep the repo for `sk_`, `pk_live`, `whsec_` → nothing. Confirm the webhook endpoint points at the live-mode secret.

### 2.5 Reconcile the server-side character limit
- `schema.sql:224` hardcodes 1 character for the free tier and ignores `extra_character_slots` entirely — contradicting `src/lib/entitlements.ts:71-93`. It's the only server-side cap, and it's wrong in both directions.
- **Verify:** buy a slot, confirm you can actually create the extra character.

### 2.6 Audit for anyone who already self-upgraded
- Query `profiles` for `subscription_tier = 'pro'` with a null `stripe_subscription_id`. Do this once before launch and once after locking 1.1.

---

## Phase 3 — Before you depend on it

Reliability. Can be done shortly after launch, but not much later.

### 3.1 Get off the Supabase free tier
`.github/workflows/keep-warm.yml` says the free tier's auto-pause "has taken the live site down mid-session twice", mitigated with a cron ping. Free tier also means limited backup retention and no point-in-time recovery — with a single production database and migrations applied out-of-band, **there is currently no tested restore path.**
**Verify:** perform a restore into a scratch project and confirm it works. An untested backup isn't a backup.

### 3.2 Make CI an actual gate
`.github/workflows/ci.yml` triggers on push; Vercel builds from the same push. Verified against the v2.635.0 run — CI finishes *after* production is live. The regression scripts, the hooks check and the TypeScript baseline all run too late to stop anything.
**Fix:** Vercel deployment protection / "wait for CI", or `vercel build && vercel deploy --prebuilt` inside the Actions job.
**Verify:** push a deliberate type error; production must not update.

### 3.3 Remove the second deploy path
`watch-and-deploy.ps1` pushes straight to main with no type check, no build, and no version or service-worker cache bump — so a deploy through it leaves every client on a stale cached shell. `install-watcher.bat` registers it as a hidden scheduled task at logon.
**Verify:** the scheduled task is gone and the scripts are deleted.

### 3.4 Automate the version bump
Nothing writes `src/version.ts`; the bump is manual. Forgetting it ships a build whose service-worker cache name is unchanged, silently no-opping the update path for every user.
**Verify:** deploy twice without touching the version by hand; confirm it increments and clients pick up the update.

### 3.5 Add drift detection for migrations
There's no `supabase db push` or `db diff` anywhere. Migrations are applied to production directly, then back-filled into the repo. `docs/MIGRATION_DRIFT_CLEANUP.md` documents an entire arc spent recovering from exactly this — and is now itself 35 migrations stale.
**Verify:** a CI job runs `supabase db reset` against a scratch database and succeeds, plus a scheduled `db diff --linked` that fails on drift.

### 3.6 Error-check the writes that lose user data
About 109 of 284 mutating queries discard their result or destructure away the error. Combined with optimistic local updates, failures are invisible until reload.
Highest-risk subset, all writing to `characters`: `DMScreen.tsx:155` (DM edits to player sheets), `PartyDashboard.tsx:619` (HP and conditions), `CampaignDashboard.tsx:1244,1253` (campaign join/leave).
**Fix:** an `assertOk()` helper plus an ESLint rule banning bare `await supabase.from(`.
**Verify:** the lint rule fails on a bare call.

---

## Quick reference

| # | Item | Phase | Effort |
|---|---|---|---|
| 1.1 | Lock `profiles` update policy | Users | 1 h |
| 1.2 | JWT + CORS on edge functions | Users | 2 h |
| 1.3 | Enforce share token in RLS | Users | 30 m |
| 1.4 | Escape dice-overlay labels + add CSP | Users | 2 h |
| 1.5 | Storage bucket folder ownership | Users | 30 m |
| 1.6 | Revoke anon `get_campaign_by_code` | Users | 15 m |
| 1.7 | Fix `session_states` data loss | Users | 1–2 d |
| 1.8 | Commit the 3 missing edge functions | Users | 1 h |
| 1.9 | Error telemetry | Users | 1 h |
| 1.10 | Real auth redirect URLs | Users | 15 m |
| 2.1 | One-time purchase fulfillment | Money | 1 d |
| 2.2 | Webhook idempotency | Money | 2 h |
| 2.3 | Remove client-side grants | Money | 1 h |
| 2.4 | Live Stripe keys | Money | 30 m |
| 2.5 | Reconcile character limit | Money | 1 h |
| 2.6 | Audit for self-upgrades | Money | 15 m |
| 3.1 | Paid Supabase + tested restore | Depend | cost + 2 h |
| 3.2 | CI as a real gate | Depend | 1–2 h |
| 3.3 | Remove second deploy path | Depend | 10 m |
| 3.4 | Automate version bump | Depend | 30 m |
| 3.5 | Migration drift detection | Depend | 4–6 h |
| 3.6 | Error-check `characters` writes | Depend | 3 d |

**Phase 1 totals roughly two days** (dominated by 1.7). Phase 2 is about two more. Phase 3 is a week, mostly 3.5 and 3.6.

---

## The dev affordances that replace the deferred holes

Put the affordance in the environment, not the code — then the production path has no holes at all, *and* you're testing the real path.

| Need | Don't | Do |
|---|---|---|
| Instant Pro / Ultimate | Open RLS on `profiles` | Seeded local accounts, one per tier |
| Toggle tier mid-session | Open RLS on `profiles` | `VITE_DEV_TIER_OVERRIDE` in `entitlements.ts`, gated on `import.meta.env.DEV` |
| Grant character slots | `?slots_purchased=` | Stripe test mode, card `4242 4242 4242 4242` |
| Exercise webhooks | Manual DB edits | `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook` |
| Call edge functions | Trust body `user_id` | `supabase.functions.invoke()` — attaches the JWT automatically |
| Reset to a known state | Edit production | `supabase db reset` against local Docker |

All of these depend on the local Docker database, which is why that's the first task in the audit's sequence rather than a nice-to-have.
