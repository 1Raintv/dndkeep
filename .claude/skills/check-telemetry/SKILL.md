---
name: check-telemetry
description: Triage DNDKeep's client_errors telemetry — query recent rows, separate actionable from noise, report. Use when I say /check-telemetry, "what's in telemetry", "any client errors lately", or "anything actionable in the error table".
argument-hint: [optional time window, e.g. "48h" or "since last Tuesday"]
---

# check-telemetry

Triage the `client_errors` table (audit 2.8 telemetry): what broke, for whom,
is it new, is it actionable. Local Docker DB today; prod once its migration
lands (owner queue).

The table is **write-only via the API** (insert-only RLS) — the anon/REST
route can never read it. Read through the database side: `docker exec` psql
(below) or Studio at <http://localhost:54323>.

## Steps

1. **Stack up?** `docker exec supabase_db_dndkeep psql -U postgres -d postgres -c "select 1"`.
   Failure → the local stack is down; offer `npx supabase start`, or stop here
   if the user only wanted prod (not wired yet — say so).
   — *done when:* the query returns, or the user knows why we stopped.

2. **Pull two views** (default window 7 days; honor the argument):
   - Ranked: `select message, sum(count) as hits, count(*) as sessions, max(occurred_at) as last_seen, min(app_version) as first_ver from client_errors where occurred_at > now() - interval '7 days' group by message order by hits desc;`
   - Raw recent: `select occurred_at, level, message, route, count, user_id, context from client_errors order by occurred_at desc limit 30;`
   — *done when:* both result sets are in hand (empty is a valid answer).

3. **Triage each distinct message** into exactly one bucket:
   - **Actionable** — reproducible-looking app bug: has a route + stack, recurs
     across sessions, or is crash-class (ErrorBoundary / uncaught). Grep the
     message text in `src/` to name the origin file.
   - **Known noise** — matches an allowlisted pattern below; say so and move on.
   - **Unknown** — one-off with no stack or no origin; park it, don't invent a theory.
   — *done when:* every distinct message in the window is in a bucket.

4. **Report**: lead with the actionable count ("2 actionable, 1 noise, 3 unknown"),
   then per actionable item — message, origin file, hit count, first version seen,
   suggested next step. Offer to file follow-up tasks; don't fix unprompted.
   — *done when:* the user has the summary and each actionable item has a proposed owner/next step.

## Known noise

- `NavigatorLockAcquireTimeoutError` — Supabase auth lock contention; the
  library throws + handles it internally (see LOCAL_DEV troubleshooting).
- `[vite] failed to connect to websocket` — HMR in the browser pane, dev only.
- Rows with `route: /test` and message `telemetry smoke test` — the 2026-08-04
  verification insert.

## Reference

- Verbosity knobs (if volume is the complaint): `localStorage['dndkeep:log:telemetry']`
  = `debug|info|warn|error|off` per browser; `VITE_LOG_TELEMETRY_LEVEL` per build.
- Sink caps: error-level only by default, deduped (`count` column), max 50
  distinct rows per session — a huge `hits` with few `sessions` = tight loop.
- Reset wipes the table (`npx supabase db reset`) — hit counts restart from
  the last reset, not from install.
