# DNDKeep — Deployment Guide

## Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli): `npm install -g supabase`
- [Vercel CLI](https://vercel.com/docs/cli): `npm install -g vercel`
- Stripe account with a product created

---

## 1. Supabase Setup

### Create a project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon key** (Settings > API).

### Apply the schema
```bash
# Recommended: use the CLI to replay all migrations in order
supabase link --project-ref YOUR_PROJECT_REF
supabase migration up
```

This replays all 112 files in `supabase/migrations/` and produces the
complete app schema through April 2026. The repo was reconciled with
`live`'s migration history in ships v2.297–v2.305 (see
`docs/MIGRATION_DRIFT_CLEANUP.md` for details).

> **Seed data note:** A fresh DB built this way will have the full schema
> but **empty `spells`, `monsters`, and `magic_items` tables**. Canonical
> SRD content is intentionally not stored as migrations — it's loaded as
> a separate seeding step. See `docs/MIGRATION_DRIFT_CLEANUP.md` →
> "Seeding a Fresh Database" for the three options (`pg_dump` from
> existing project, re-seed from `static/*.ts`, or back-fill seed
> migrations from live).
>
> The legacy `supabase/schema.sql` snapshot is stale (predates the
> v2.297–v2.305 reconciliation) and should not be used for fresh
> provisioning.

### Enable Realtime
In Supabase Dashboard > Database > Replication, enable replication for:
- `session_states`
- `characters`
- `roll_logs`

Or run in SQL editor:
```sql
alter publication supabase_realtime add table session_states;
alter publication supabase_realtime add table characters;
alter publication supabase_realtime add table roll_logs;
```

### Deploy Edge Functions
```bash
supabase functions deploy stripe-webhook
supabase functions deploy create-checkout
supabase functions deploy create-portal-session

# Set secrets
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 2. Stripe Setup

### Create a product and price
1. Stripe Dashboard > Products > Create product "DNDKeep Pro"
2. Add a recurring monthly price (e.g. $9/month)
3. Copy the **Price ID** (starts with `price_`)

### Configure the webhook
1. Stripe Dashboard > Developers > Webhooks > Add endpoint
2. Endpoint URL: `https://your-project.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the **Webhook signing secret** (starts with `whsec_`)

---

## 3. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRO_MONTHLY_PRICE_ID=price_...
VITE_APP_URL=https://your-app.vercel.app
```

### Optional: GIF picker (Giphy)

The campaign chat (Party Chat) supports inline GIFs via Giphy. If you
don't set this up, the GIF button is simply hidden and chat works
normally without GIFs:

```bash
VITE_GIPHY_API_KEY=your_giphy_api_key
```

To get a key:

1. Sign in at https://developers.giphy.com/dashboard/
2. Click "Create an App" → choose "API" (not SDK).
3. Name it "DNDKeep" (or whatever) → confirm Giphy's brand guidelines.
4. Copy the API key from the dashboard.

Giphy's "API keys" are public client-side identifiers — they're rate-
limit anchors per app, not secrets. Shipping them in the bundle is
normal Giphy usage. The free tier is generous (1000 requests/hour),
which comfortably covers a small campaign.

After adding the key, the GIF button automatically appears in Party
Chat for everyone in your deployment. Removing the env var hides it
again on next deploy.

---

## 4. Vercel Deployment

```bash
# Install deps and build locally first to catch errors
npm install
npm run build

# Deploy
vercel

# Set environment variables in Vercel
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_STRIPE_PUBLISHABLE_KEY
vercel env add VITE_STRIPE_PRO_MONTHLY_PRICE_ID
vercel env add VITE_APP_URL
# Optional — only if you want the GIF picker enabled:
vercel env add VITE_GIPHY_API_KEY

# Deploy to production
vercel --prod
```

### Update Supabase auth redirect
In Supabase Dashboard > Authentication > URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: add `https://your-app.vercel.app/**`

---

## 5. Vercel + Supabase Integration (optional)

Vercel has a native Supabase integration that auto-syncs env vars:
1. Vercel Dashboard > your project > Integrations > Supabase
2. Connect your Supabase project
3. Env vars sync automatically on each deployment

---

## 6. Local Development

```bash
npm install
cp .env.example .env.local
# Fill in your Supabase and Stripe credentials

npm run dev
# Vite dev server at http://localhost:5173
```

For local Supabase (optional):
```bash
supabase start
# Local Studio at http://localhost:54323
# Local API at http://localhost:54321
```

For Stripe webhook testing locally:
```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```

---

## 7. Post-launch Checklist

- [ ] Supabase schema applied and verified
- [ ] RLS policies active (check in Table Editor)
- [ ] Realtime enabled on `session_states`, `characters`, `roll_logs`
- [ ] Edge functions deployed and tested
- [ ] Stripe webhook receiving events (check Dashboard > Webhooks)
- [ ] Vercel environment variables set
- [ ] Supabase auth redirect URLs updated with production domain
- [ ] Test Free tier character limit (try creating 2 characters)
- [ ] Test Pro upgrade flow end-to-end
- [ ] Test subscription cancellation downgrade
- [ ] Test real-time combat sync with two browser windows

---

## Architecture Summary

```
Browser (Vite + React + TypeScript)
  |
  |-- Supabase JS client (auth, REST, realtime)
  |-- Stripe.js (checkout redirect)
  |
  v
Vercel (static hosting + CDN)

Supabase (backend)
  |-- Auth (email/password, JWT)
  |-- PostgreSQL (profiles, characters, campaigns, sessions, rolls)
  |-- Row Level Security (enforces data isolation)
  |-- Realtime (Postgres changes → WebSocket → client)
  |-- Edge Functions (Deno, deployed to Supabase cloud)
      |-- stripe-webhook      ← receives Stripe events, updates profile
      |-- create-checkout     ← creates Stripe Checkout session
      |-- create-portal-session ← opens Stripe billing portal

Stripe
  |-- Products / Prices
  |-- Checkout Sessions
  |-- Customer Portal
  |-- Webhooks → Supabase Edge Function
```
