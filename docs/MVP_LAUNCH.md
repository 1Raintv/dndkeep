# DNDKeep — MVP Launch Plan

**Established:** 2026-08-25
**Shape of the launch (owner decision):** **full store live** + **invite-only beta**.
**Status:** Living document. Tick items as they land; keep the summary table current.

Companion to `.claude/audit/dndkeep-go-live-checklist.md` (the original phased
checklist) and `.claude/audit/dndkeep-audit.md` (the architecture audit and its
status table). This document supersedes the *ordering* in the go-live checklist,
because the two decisions above change what blocks what.

---

## What the two decisions mean

**Full store at launch** means real money moves on day one, through every product —
subscription *and* all six one-time purchases. Nothing in Phase 2 can be deferred,
and §2.1 (one-time fulfillment) moves from "later" to **the single biggest blocker**.

**Invite-only beta** does *not* reduce the legal or billing bar. You are charging
people; ToS, privacy policy, refund policy and a support channel are required
whether there are 12 users or 12,000. What invite-only genuinely buys you is
**scale and ops headroom** — the Phase 4 reliability items can trail the launch by
days instead of blocking it, because a known, small, reachable user set is one you
can email when something breaks.

It also adds one net-new work item: **there is no invite gating today.** `/auth`
signup is open to anyone with the URL.

---

## Where this stands (v2.683.0, 2026-08-25)

Phases 0, 1 and 2 are **written and locally verified**. What remains on them is
**deployment and Stripe setup, both owner-side** — see "The two things blocking
launch" below.

Every SQL change was applied to the local Docker database and then attacked:
the exploit for each hole was run against the hardened schema and confirmed to
fail, and the legitimate flow it protects was confirmed to still work. That
process earned its keep — the first version of the `profiles` billing guard
silently allowed everything, because a `SECURITY DEFINER` trigger sees
`current_user` as its own owner (`postgres`) and so always took the bypass
branch. The migration now carries a comment saying not to reintroduce it.

**Not yet deployed.** The three rewritten edge functions exist only in the repo.
The Supabase CLI on this machine is not logged in and `supabase login` is
interactive, so they could not be pushed from here. Until they are deployed and
`APP_ORIGIN` is set, the Store cannot complete a purchase — which is also true
today, so this is not a regression.

**Done directly against production:** the three legacy endpoints
(`push-to-github`, `buy-character-slots`, `buy-dice-skin`) were each overwritten
with a permanently-refusing 410 stub. The last two mattered because their
client-side fulfilment had just been deleted, so leaving them live meant an
endpoint that could take a payment and deliver nothing.

---

## The critical path, in order

### Phase 0 — Invite gating — ✅ **app side DONE (v2.680.0)**, one owner step left

**Owner decision: disable public sign-ups, invite by email from the Supabase
dashboard.** No `beta_invites` table, no claim RPC, no self-serve funnel — the
guest list is the dashboard.

Shipped in v2.680.0:
- `signUp()` deleted from `src/lib/supabase.ts` and the "Create Account" tab
  removed from `AuthPage.tsx`. Removed rather than hidden: a disabled control that
  still posts is a hole, and a visible one that always fails reads as broken.
- **A set-password landing (`/set-password`, `SetPasswordPage.tsx`) — this turned
  out to be required, not optional.** Supabase invite links land on the site root
  with the token in the URL fragment, and the client's `detectSessionInUrl: true`
  consumes it before React renders. Without a landing, `HomeRedirect` sent invited
  users straight to `/lobby`: signed in, never asked for a password, and unable to
  sign in again once the session expired. One session, then locked out forever.
- `src/lib/authLanding.ts` captures the fragment's `type` at module-evaluation
  time, *before* `createClient()` wipes it. **The bare `import './authLanding'` at
  the top of `supabase.ts` is load-bearing** — an imported module's body runs
  before its importer's, which is the only reason the capture wins the race. 8
  unit tests cover the parser, including expired-link and bare-`#type=recovery`
  fragments.
- **A forgot-password flow, which never existed at all.** The app had no
  `resetPasswordForEmail`, no `updateUser`, no reset route — a forgotten password
  was a permanent lockout. Survivable when anyone could re-register; under
  invite-only it would mean the account is simply gone.
- Landing page CTAs now say "Request an invite" instead of "Get started free",
  and the false "No credit card required" / "Free forever" copy is gone.
- Also corrected in passing: `PRO_FEATURES` advertised **"Unlimited characters"**,
  which was never true — `MAX_CHARACTER_SLOTS` is 10 and slots are a separate
  purchase at every tier. A subscription buys the level cap coming off and one
  campaign to DM. That was a pricing claim on a page about to take money.

**Still owner-side:**
1. **Disable sign-ups in the dashboard** (Authentication → Providers → Email →
   "Allow new users to sign up"). **Owner decision 2026-08-25: deferred, accepted
   risk.** Recorded plainly so it is a choice and not a surprise: the app no
   longer shows a sign-up form, but gotrue's `/signup` endpoint still accepts
   requests, so anyone who knows the API can still create an account. Low stakes
   while the app is unadvertised and the store cannot charge; revisit before the
   beta is publicised or Stripe goes live.
2. `INVITE_CONTACT` in `LandingPage.tsx` — **blank pending the domain purchase**,
   and blank is a supported state as of v2.681.0: the CTAs read "Invites opening
   soon" and are genuinely disabled rather than dead links. Setting the constant
   turns all five back into working `mailto:` buttons; no other edit needed.
3. Confirm the Supabase email templates (Invite, Reset Password) point at the real
   production URL — see Phase 1 item 6, which is the same underlying setting.

> **The domain purchase is now on the critical path.** It gates the invite
> contact address (Phase 0), the auth redirect URLs (Phase 1 item 6), the sender
> address on invite and reset emails, and the business details Stripe asks for at
> activation (Phase 2 item 6). Worth buying early even though nothing is ready to
> point at it yet — everything downstream waits on it.

**Verify:** `curl` the gotrue signup endpoint directly → rejected. Invite an
address from the dashboard, open the emailed link → lands on `/set-password`,
choosing a password and display name works, and signing out and back in with that
password succeeds.

### Phase 1 — Safe for real users (~2 days)

All verified still open as of 2026-08-25. Each is exploitable by any logged-in user.

1. **Lock the `profiles` UPDATE policy** — `supabase/schema.sql:158` is
   `using (auth.uid() = id)` with no column restriction and no `WITH CHECK`. Any
   user PATCHes themselves to `subscription_tier: 'pro'`. Doubly urgent now: with
   the store live, this is the difference between a customer and a free rider. *(1 h)*
   - Revoke UPDATE on the billing columns from `authenticated`; add a
     `BEFORE UPDATE` trigger rejecting changes from anything but the service role.
   - Replace the convenience with `VITE_DEV_TIER_OVERRIDE` in
     `src/lib/entitlements.ts`, gated on `import.meta.env.DEV`.
   - **Verify:** `PATCH /rest/v1/profiles?id=eq.<own uid>` with
     `{"subscription_tier":"pro"}` → fails, value unchanged.

2. **JWT auth + CORS pin on the edge functions** *(3 h — larger than the checklist says)*
   - Server side: `create-portal-session/index.ts:28` and `create-checkout/index.ts:28`
     use a service-role client and read `user_id` from the request body. The
     `Authorization` header is never read. Pass any UUID → get a live Stripe portal
     for that account (cancel their subscription, read invoices with billing address
     and card last-four, change payment method).
   - **The client side is also broken and the checklist misses it:** `src/lib/stripe.ts`
     calls all three endpoints with raw `fetch()` (lines 46, 77, 99), so no JWT is
     attached at all. There are **zero** `supabase.functions.invoke()` calls in the
     whole codebase. Both sides have to change together or checkout breaks.
   - Pin `Access-Control-Allow-Origin` to the app origin (currently `*` in both).
   - **Verify:** valid JWT plus a *different* `user_id` in the body → acts on the
     JWT's user. No `Authorization` header → 401.

3. **Enforce the share token in RLS** — `20260331024419_shareable_character_sheets.sql:22`
   is `USING (share_enabled = true)` and never references `share_token`. The token
   is a client-side filter only, so every shared sheet is anonymously readable:
   names, backstories, notes, personality traits, bonds, flaws, `user_id`. *(30 m)*
   - **Verify:** anonymous `GET /rest/v1/characters?select=*` → zero rows. A valid
     share link still loads.

4. **Storage bucket folder ownership** — `20260424161240_v2_215_battlemap_assets_bucket.sql`
   flags the bucket public and its INSERT policy checks only `bucket_id`, so any
   authenticated user writes into any other user's asset folder (UPDATE and DELETE
   both have the ownership predicate; INSERT does not). Add
   `(storage.foldername(name))[1] = auth.uid()::text` to INSERT; flip the bucket
   private. *(30 m)*

5. **Revoke anon on `get_campaign_by_code`** — `20260330124930_add_campaign_join_code.sql:76`
   is `SECURITY DEFINER` with no `REVOKE ... FROM PUBLIC`. Anonymous callers
   enumerate campaigns and harvest `owner_id` UUIDs — which is precisely what makes
   item 2 easy to exploit. The newer `join_campaign_by_code` revokes correctly, so
   this is an inconsistency, not a pattern. *(15 m)*

6. **Real auth redirect URLs** — `supabase/config.toml:25` still reads
   `https://your-app.vercel.app`, a literal placeholder. Confirm the real URL is set
   in the Supabase Dashboard and test password reset and email confirmation
   end-to-end on production. *(15 m)*

7. **CSP header in `vercel.json`** — the still-open half of go-live §1.4. Do it as
   its own separately-verified change: a wrong CSP breaks the three.js dice and the
   Pixi battle map, and you will not find out from a build. *(2 h)*

8. **Audit for anyone who already self-upgraded** — once, immediately after item 1
   lands. Query `profiles` for `subscription_tier = 'pro'` with a null
   `stripe_subscription_id`. *(15 m)*

> **Already done, dropped from the old checklist:** §1.7 (`session_states` data
> loss — the writes are gone repo-wide), §1.9 (error telemetry — live on prod and
> test since 2026-08-07), and the label-escaping half of §1.4.

### Phase 2 — The store actually works — **the launch blocker**

**Owner decision: the full store ships at launch**, all six one-time products
alongside the subscription.

> **2026-08-25 — what is actually deployed to production.** Read directly off the
> live project (`ufowdrspkprlpdnjjkaj`), because none of this is inferable from
> the repo. It is worse than the checklist assumed and it changes the plan:
>
> | Deployed to prod | In the repo? | `verify_jwt` |
> |---|---|---|
> | `buy-character-slots` | ❌ no | true |
> | `buy-dice-skin` | ❌ no | true |
> | `discord-bot` | ❌ no | false *(correct — see below)* |
> | `push-to-github` | ❌ no | **false** ⚠️ |
> | `create-checkout` | ✅ yes | **not deployed** |
> | `create-portal-session` | ✅ yes | **not deployed** |
> | `stripe-webhook` | ✅ yes | **not deployed** |
>
> **The three functions the app actually calls do not exist in production.**
> `src/lib/stripe.ts` POSTs to `create-checkout` and `create-portal-session`; both
> would 404 today. **There is no Stripe webhook deployed at all**, so nothing
> server-side has ever fulfilled a purchase.
>
> **The two deployed `buy-*` functions get auth right and fulfillment wrong.**
> Both verify the JWT properly (anon client + `getUser()`, the pattern the
> checklist praised). But neither has a webhook behind it: each creates a Checkout
> Session whose `success_url` carries the entitlement as a query parameter —
> `/settings?slots_purchased=5`, `/character?skin_unlocked=gold`. **The browser
> landing on that URL *is* the fulfillment.** So paying and closing the tab grants
> nothing, and visiting the URL without paying grants everything. This is the
> other half of item 4 below, and explains why that client-side grant exists.
>
> **The catalogues disagreed three ways — RESOLVED 2026-08-25 (v2.682.0).**
> Deployed `buy-character-slots` sold one SKU (5 slots for $5.00) against
> `entitlements.ts`'s single slots to a max of 10; deployed `buy-dice-skin` sold
> `obsidian`/`gold`/`ice`/`blood` at $2.99 against the Store page's
> `DICE_DYE_RED`/`GREEN`/`BLUE` at $2.
>
> **Owner decision: the repo is the catalogue of record, and the paid dice are
> Crimson / Emerald / Sapphire.** Shipped in v2.682.0:
> - The four old skins are retired and the three gems built in
>   `src/data/diceSkins.ts`. Free to do: `dice_skin_unlocks` was **empty in
>   production** — nobody had ever bought one — so nothing was taken from anyone.
> - **The second store is gone.** The dice roller used to POST to `buy-dice-skin`
>   with its own catalogue and its own price; its buy button now hands off to
>   `/store`. Dice are sold in exactly one place.
> - **One name end to end.** `DICE_CRIMSON` (env) → `product_key` → `skin_id` in
>   `dice_skin_unlocks` → `id` in `diceSkins.ts` all read `crimson`. The old
>   colour names would have needed a colour→gem mapping at the webhook, which is
>   precisely the kind of translation that silently grants the wrong product.
>   Renaming was free because no Stripe prices existed under the old names.
> - The `?skin_unlocked=` client-side grant is deleted: it marked a skin owned
>   from a query parameter with no payment, and never wrote to the table, so a
>   real buyer lost the skin on reload anyway.
>
> **Character slots stay as `entitlements.ts` models them** — single slots, 1
> base + up to 9 bought, max 10. The deployed 5-for-$5 SKU dies with
> `buy-character-slots`.
>
> Still outstanding: **the seven Stripe Price objects do not exist.** Every
> `VITE_STRIPE_*_PRICE_ID` is unset, which is why every Store product renders
> "Coming soon". `.env.example` now lists all seven.
>
> **`discord-bot` is fine and handles no money.** The go-live checklist listed it
> as money-handling; it is a session-availability scheduler. It verifies Ed25519
> request signatures before touching anything, which is why `verify_jwt: false` is
> correct — Discord cannot mint a Supabase JWT. Commit it for the record, but it
> is not a blocker.

#### ⚠️ 2.0 — Delete `push-to-github` and rotate its token (do this first)

Not in the audit, not in the checklist, and the most serious thing found so far.
It is a **third undocumented deploy path**, beyond `deploy.bat` and
`watch-and-deploy.ps1`.

- `verify_jwt: false` and `Access-Control-Allow-Origin: *` — reachable
  anonymously from any origin.
- Holds a `GITHUB_TOKEN` with write access to `1Raintv/dndkeep`, and commits
  arbitrary caller-supplied files straight to **`main`**, which Vercel
  auto-deploys. That is full remote code execution on the live site and every
  user's session.
- The only guard is a shared static `DEPLOY_KEY`, compared with `!==`, and
  **accepted in the request body** as well as a header — so it lands in logs and
  browser history.
- It is a March-2026 legacy "agent writes to the repo" mechanism, superseded by
  ordinary git. Nothing in the app calls it.

**Status 2026-08-25 — hole closed, cleanup outstanding.** Owner approved removal.
The live function was overwritten with a permanently-refusing 410 stub and
flipped to `verify_jwt: true`, so it is now double-locked; an anonymous POST in
the original attack shape returns 401, verified against production. The original
source is preserved at `supabase/functions/_retired/push-to-github/index.ts`.

Still to do, both owner-side:
- **Delete the function outright** (Dashboard → Edge Functions → push-to-github →
  Delete). The stub is inert but the function and its stored secrets still exist.
  Could not be done from here: the MCP server exposes no delete, and the Supabase
  CLI on this machine is not logged in (`supabase login` is interactive).
- **Rotate `GITHUB_TOKEN` and `DEPLOY_KEY`.** This is the part that actually
  matters and only you can do it — a secret that sat behind an anonymous endpoint
  must be treated as disclosed, whatever happens to the endpoint.

**Verify:** the slug 404s, and the old token is rejected by the GitHub API.

---

With the full store live, the rest of this phase decides whether launch day is a
launch or an incident.

1. **Fix one-time purchase fulfillment** *(1 d)* — three separate breaks on one
   path, and **every one of the six one-time products goes through it.** Traced:
   `StorePage.tsx:78` → `redirectToOneTimeCheckout` → `stripe.ts:77` → the
   `create-checkout` edge function.
   - `create-checkout/index.ts:62` hardcodes `mode: 'subscription'` and **discards
     the `mode` and `product_key` the client correctly sends** (`stripe.ts:83-84`).
     The client side of this contract is already right; only the function is wrong.
   - `stripe-webhook/index.ts:42-64` unconditionally sets `subscription_tier: 'pro'`
     on `checkout.session.completed`, then calls
     `stripe.subscriptions.retrieve(session.subscription)`. For a one-time payment
     that is null → throws → 500. It never reads `product_key`.
   - **Net: a $2 dice dye either fails outright or silently grants full Pro.**
   - **Fix:** honour `mode` in checkout; route `product_key` → entitlement in the
     webhook.
   - **Verify:** Stripe **test mode**, card `4242 4242 4242 4242`, buy each of the
     six one-time products, confirm the correct entitlement lands and no Pro tier is
     granted. Use `stripe listen --forward-to` to exercise webhooks locally.

2. **Deploy the three repo functions; retire the two `buy-*` ones** *(2 h)* —
   **owner decision: build the dice and character-slot purchases properly.**
   - The unified path wins over per-product functions: the client already speaks
     it (`stripe.ts` sends `mode` and `product_key` correctly), and a webhook is
     mandatory anyway for fulfillment that does not trust the browser. Two more
     bespoke functions would mean two more places to get idempotency wrong.
   - So: fix `create-checkout` + `stripe-webhook` per item 1, **deploy all three**,
     point the Store at them, and only then delete `buy-character-slots` and
     `buy-dice-skin`. Deleting first would take the store from broken to absent.
   - Commit all four prod-only functions to `supabase/functions/` first, so the
     deletions are recorded rather than merely disappearing.

3. **Webhook idempotency** *(2 h)* — no processed-event table, no `event.id` dedupe.
   Stripe retries on any non-2xx, and the 500 path in item 1 guarantees retries.
   Add `stripe_events(id primary key)`, insert-or-skip.
   - **Verify:** replay the same event twice via the Stripe CLI; the entitlement is
     credited once.

4. **Remove the client-side entitlement grants** *(1 h)* — do this **with** item 1,
   not before: separately, one breaks purchases and the other leaves the hole open.
   - `src/components/pages/SettingsPage.tsx:28-34` grants character slots straight
     from `?slots_purchased=`, unverified and repeatable.
   - `20260411002552_dice_skins.sql:26` leaves `skin_id` unconstrained on the
     `dice_skin_unlocks` INSERT policy, so any user inserts any paid skin.
   - **Verify:** `/settings?slots_purchased=9` grants nothing; a direct insert into
     `dice_skin_unlocks` is denied.

5. **Reconcile the server-side character limit** *(1 h)* — `schema.sql:224`
   hardcodes 1 character for the free tier and ignores `extra_character_slots`
   entirely, contradicting `src/lib/entitlements.ts:71-93`. It is the only
   server-side cap and it is wrong in both directions.
   - **Verify:** buy a slot, then actually create the extra character.

6. **Switch Stripe to live mode** *(30 m)* — `.env.production` currently carries
   `pk_test_placeholder` and `price_placeholder`, which is why the Store renders
   every product as "Coming soon" today. All seven price IDs must be created in
   Stripe and set.
   - **Live keys go in the Vercel dashboard only.** Note `.env.production` is
     **committed** and `.gitignore` only covers `.env`, `.env.local` and
     `.env.*.local` — fix that ignore rule *before* a live key exists anywhere.
   - **Verify:** `grep -rn "sk_\|pk_live\|whsec_"` over the repo returns nothing.
     The webhook endpoint points at the live-mode signing secret.

7. **Walk the full subscription lifecycle in test mode** *(2 h)* — subscribe →
   webhook → tier lands → portal opens → cancel → subscriber-gated things freeze
   (level 10+ characters, DM'd campaigns) → resubscribe → they unfreeze. The
   freeze/unfreeze contract in `entitlements.ts` is well specified and has never
   been exercised against real Stripe events.

### Phase 3 — Legal and operational surface (~2–3 days)

**None of this exists today**, and it is in neither the audit nor the go-live
checklist. Charging money is what makes it mandatory — invite-only changes nothing.

1. **Terms of Service, Privacy Policy, Refund/Cancellation policy.** No such page
   exists anywhere in `src/`. Stripe requires a reachable ToS and refund policy;
   GDPR/CCPA require the privacy notice. It must name Supabase and Stripe as
   sub-processors and say where data lives.
   - The refund policy has to cover the awkward case explicitly: **one-time
     purchases that freeze when a subscription lapses.** Extra campaign slots and
     level-10+ characters are "owned forever" but unusable without an active
     subscription (`entitlements.ts`, FREEZE PRINCIPLE). That is a defensible model
     and a chargeback magnet if it is not written down before the sale.
2. **Account deletion and data export.** No `deleteAccount` path exists. GDPR
   right-to-erasure. Needs to cascade cleanly across characters, campaigns owned as
   DM (what happens to the players?), and Stripe (cancel the subscription).
3. **A support contact.** There is not one `mailto:` or support address in the app.
   You cannot run a paid service with no inbound channel — and during an invite-only
   beta, feedback *is* the point.
4. **SRD / licensing final pass.** In good shape — v2.672, v2.673 and v2.679 did
   real work and `/srd` (`SrdAttributionPage`) exists. Confirm the CC-BY-4.0 notice
   is reachable from the landing page and the footer, not only from a deep route
   someone has to guess.
5. **The landing page has to sell it.** `LandingPage.tsx` renders at `/` for
   logged-out users. Read it once as a stranger: does it say what this is, show the
   battle map, state the price, and now also explain that access is invite-only and
   how to get one?
6. **Cookie/consent** — likely fine (no analytics found in the codebase). Re-check
   the moment you add any.

### Phase 4 — Reliability (~1 week; may trail launch, invite-only earns you that)

1. **Get off the Supabase free tier and test a restore.** `keep-warm.yml` exists
   because the free tier's auto-pause "has taken the live site down mid-session
   twice". Free tier also means limited backup retention and no point-in-time
   recovery. With a single production database and migrations historically applied
   out-of-band, **there is no tested restore path.** Restore into a scratch project
   and confirm it works — an untested backup is not a backup.
   - **This is the item to pull forward** despite the invite-only cushion. A small
     beta with paying customers is still a set of people whose data you have
     promised to keep.
2. **Make CI an actual gate.** `.github/workflows/ci.yml` triggers on push and
   Vercel builds from the same push — verified against the v2.635.0 run, CI finishes
   *after* production is live. Fix with Vercel deployment protection, or
   `vercel build && vercel deploy --prebuilt` inside the Actions job.
   - **Verify:** push a deliberate type error; production must not update.
3. **Delete the second deploy path.** `watch-and-deploy.ps1` pushes straight to main
   with no type check, no build, and no version or service-worker cache bump, so a
   deploy through it leaves every client on a stale cached shell.
   `install-watcher.bat` registers it as a hidden scheduled task at logon.
4. **Automate the version bump.** Nothing writes `src/version.ts`. Forgetting it
   ships a build whose service-worker cache name is unchanged, silently no-opping
   the update path for every user — which during a beta means your testers are
   testing last week's build.
5. **Migration drift detection.** No `supabase db push` or `db diff` anywhere.
   `docs/MIGRATION_DRIFT_CLEANUP.md` documents an entire arc spent recovering from
   exactly this.
6. **Error-check the remaining writes.** The `checkedWrite` seam
   (`src/lib/api/checked.ts`) exists and 71 sites are converted; sweep the
   stragglers as they are touched, per `docs/CODING_STANDARDS.md`.

---

## Summary table

| Phase | Item | Est | Status |
|---|---|---|---|
| 0 | Invite-only auth: sign-up removed, set-password + reset flows | 4 h | ✅ v2.680.0 |
| 0 | Disable sign-ups in the Supabase dashboard (owner) | 5 m | ⬜ |
| 0 | Fill in `INVITE_CONTACT` on the landing page | 5 m | ⬜ |
| 2 | ⚠️ Delete `push-to-github`, rotate `GITHUB_TOKEN` | 30 m | ⬜ |
| 2 | Choose one product catalogue (slots + dice) | — | ✅ v2.682.0 |
| 2 | Create the 7 Stripe Price objects (owner) | 30 m | ⬜ **blocks 2.1** |
| 1 | Lock `profiles` UPDATE policy | 1 h | ✅ v2.683.0 |
| 1 | JWT + CORS on edge functions **and** `stripe.ts` client | 3 h | ✅ v2.683.0 (not deployed) |
| 1 | Enforce share token in RLS | 30 m | ✅ v2.683.0 |
| 1 | Storage bucket folder ownership | 30 m | ✅ v2.683.0 |
| 1 | Revoke anon `get_campaign_by_code` | 15 m | ✅ v2.683.0 |
| 1 | Real auth redirect URLs | 15 m | ⬜ |
| 1 | CSP header | 2 h | 🟡 v2.683.0 report-only |
| 1 | Audit for existing self-upgrades | 15 m | ⬜ |
| 2 | **One-time purchase fulfillment** | 1 d | ✅ v2.683.0 (not deployed) |
| 2 | Retire the 2 orphaned money functions | 1 h | ✅ v2.683.0 stubbed |
| 2 | Webhook idempotency | 2 h | ✅ v2.683.0 |
| 2 | Remove client-side entitlement grants | 1 h | ✅ v2.683.0 |
| 2 | Reconcile server character limit | 1 h | ✅ v2.683.0 |
| 2 | Live Stripe keys + fix `.gitignore` | 30 m | ⬜ |
| 2 | Full subscription lifecycle test | 2 h | ⬜ |
| 3 | ToS / Privacy / Refund pages | 1 d | ⬜ |
| 3 | Account deletion + data export | 1 d | ✅ v2.694.0 |
| 3 | Support contact | 30 m | ⬜ |
| 3 | SRD notice reachable from landing + footer | 30 m | ✅ v2.694.0 |
| 3 | Landing page: invite-only messaging + price | 4 h | ⬜ |
| 4 | Paid Supabase + **tested** restore | 2 h + cost | ⬜ |
| 4 | CI as a real gate | 2 h | ⬜ |
| 4 | Delete watcher deploy path | 10 m | ⬜ |
| 4 | Automate version bump | 30 m | ✅ v2.683.0 |
| 4 | Migration drift detection | 4–6 h | ⬜ |
| 4 | Sweep remaining unchecked writes | 3 d | ⬜ |

**Phases 0–3 are the launch: roughly 7–8 working days.** Phase 4 is about a week
and can trail, with the exception of the tested restore path.

## The two things blocking launch (both owner-side)

Everything in Phases 0–2 that could be written has been written. These two
cannot be done from a dev machine and nothing else in the payments path can be
tested until they are.

### 1. Deploy the four functions and set their secrets

```bash
supabase login
supabase functions deploy create-checkout        --project-ref ufowdrspkprlpdnjjkaj
supabase functions deploy create-portal-session  --project-ref ufowdrspkprlpdnjjkaj
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref ufowdrspkprlpdnjjkaj
```

`--no-verify-jwt` on the webhook only: Stripe cannot mint a Supabase JWT, and
its authenticity comes from the signature check instead. Putting it on either of
the other two would undo the fix this release exists for.

Secrets:

```bash
supabase secrets set APP_ORIGIN=https://<your-domain>,https://dndkeep.vercel.app
supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...
```

`APP_ORIGIN` replaces the `Access-Control-Allow-Origin: *` these functions used
to carry. **Unset, it fails closed** — browsers will refuse the responses — so
it is not optional.

Then point the Stripe webhook endpoint at
`https://ufowdrspkprlpdnjjkaj.supabase.co/functions/v1/stripe-webhook` and
subscribe it to `checkout.session.completed`,
`customer.subscription.created/updated/deleted`, `invoice.payment_failed`.

### 2. Create the seven Stripe Price objects

Nothing in the Store can be bought until these exist — every button reads
"Coming soon" because the price IDs are unset. Names must match
`.env.example`:

| Product | Price | Env var |
|---|---|---|
| Pro subscription | $5/mo | `VITE_STRIPE_PRO_MONTHLY_PRICE_ID` |
| Character slot | $5 | `VITE_STRIPE_CHARACTER_SLOT_PRICE_ID` |
| Extra campaign slot | $5 | `VITE_STRIPE_CAMPAIGN_SLOT_PRICE_ID` |
| Ultimate Campaign | $10 | `VITE_STRIPE_ULTIMATE_CAMPAIGN_PRICE_ID` |
| Crimson Dice | $2 | `VITE_STRIPE_DICE_CRIMSON_PRICE_ID` |
| Emerald Dice | $2 | `VITE_STRIPE_DICE_EMERALD_PRICE_ID` |
| Sapphire Dice | $2 | `VITE_STRIPE_DICE_SAPPHIRE_PRICE_ID` |

Do it in **test mode** first and walk the whole path with card
`4242 4242 4242 4242`: buy each of the six one-time products, confirm exactly
the right entitlement lands and no Pro tier is granted, then replay one event
with `stripe listen` and confirm it credits once, not twice.

---

## Suggested branch sequence

Each is one branch through the normal gate (`type-check`, `build`, `raw-check`,
`coords-check`, `anchor-check`, `test`):

1. `launch/rls-lockdown` — Phase 1 items 1, 3, 4, 5. All SQL, all verifiable with curl.
2. `launch/edge-auth` — Phase 1 item 2, both sides, plus the CORS pin.
3. `launch/invite-gate` — Phase 0.
4. `launch/store-fulfillment` — Phase 2 items 1, 3, 4, 5. These are one change;
   splitting them opens a window where purchases break but the grant hole is still open.
5. `launch/csp` — Phase 1 item 7, alone, browser-verified against dice and map.
6. `launch/legal-pages` — Phase 3 items 1, 2, 3, 4.
7. `launch/landing` — Phase 3 item 5.
8. Owner-side, no branch: Stripe live keys and the seven price IDs, Supabase
   redirect URLs, paid Supabase tier.
