---
name: troubleshoot-dndkeep
description: Dig into a reported DNDKeep issue evidence-first — telemetry, auth audit trail, domain tables, live repro — before theorizing. Use when I say /troubleshoot-dndkeep, "why did X happen", "a user hit/saw …", "dig into this issue", or a bug report mentions actions someone took on the site.
argument-hint: [the report, e.g. "my HP reset after the battle map loaded"]
---

# troubleshoot-dndkeep

Evidence before theory. A non-obvious DNDKeep issue usually left a trail —
in `client_errors`, in the auth audit log, in domain tables' timestamps —
and the trail beats the first plausible guess. This skill gathers the trail;
the global `/diagnosing-bugs` loop owns hypothesis-and-fix once evidence is
in hand.

## Steps

1. **Pin the report**: who (which account), when (convert to a UTC window —
   DB timestamps are UTC), where (route/feature), and what they *did* right
   before. Ask only for what the reporter actually knows.
   — *done when:* you have a UTC window and a route, even approximate.

2. **Which environment?** Local Docker DB → full trail below. Production →
   `client_errors` doesn't exist there yet and direct DB access needs the
   owner (see audit owner-queue); say what's unavailable and work the
   local-repro route instead.
   — *done when:* the evidence sources for this env are named.

3. **Sweep the trail** (all read-only; `docker exec supabase_db_dndkeep
   psql -U postgres -d postgres -c "…"`):
   - **Telemetry**: run `/check-telemetry` scoped to the window — unhandled
     errors with route + stack are the strongest evidence.
   - **Auth trail**: `select created_at, payload->>'action' as action from
     auth.audit_log_entries where created_at between … order by created_at;`
     — logins, token refreshes, failures around the incident.
   - **Domain state**: the tables the feature writes (`characters.updated_at`,
     `roll_logs.rolled_at`, `combat_encounters`, scene tables…) — did the
     user's action write what the UI claims it did, and when?
   — *done when:* each source either yielded rows in the window or is
   explicitly ruled empty. Empty is evidence too (e.g. "no roll_logs row"
   = the roll never settled).

4. **Correlate**: lay the rows on one timeline; name the suspect code path
   by grepping the message/table writers in `src/`. If telemetry was silent
   but the bug is real, note the capture gap — a handled-but-wrong path
   writes no telemetry (that's a finding, not a dead end).
   — *done when:* one suspect path is named, or the trail genuinely forks.

5. **Reproduce live** against the local stack: `/check-logs` machinery or
   `/verify-ui-dndkeep` logged-in flows (seeded DM, scripted actions).
   A repro converts the correlation into proof.
   — *done when:* reproduced — then hand to `/diagnosing-bugs` for the
   fix loop — or honestly not reproducible, reported as such with the
   evidence table.

6. **Feed back**: anything the sweep exposed about the tooling itself —
   a noisy pattern for the sink's denylist, a missing enrichment field, a
   handled-error path that deserves a `log.warn` — file it (task or
   owner-queue), don't silently fix.
   — *done when:* the answer AND any tooling gaps are written down.

## Reference

- Timestamps: everything DB-side is UTC; the reporter's clock is local.
  Off-by-timezone is the classic false "no rows in window".
- `client_errors` dedupes (`count` column) and caps at 50 rows/session —
  absence of NEW rows ≠ absence of recurrence; check `count` growth.
- Handled errors (shown in the UI, caught-and-ignored writes) leave NO
  telemetry — audit 3.4's repo-layer work shrinks that blind spot.
- Local stack down → `npx supabase start`; the trail survives restarts
  (volumes persist; only `db reset` wipes).
