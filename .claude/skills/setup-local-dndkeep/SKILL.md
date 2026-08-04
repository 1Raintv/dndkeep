---
name: setup-local-dndkeep
description: Walk the user through setting up the OPTIONAL local dev environment for DNDKeep — from possibly nothing installed (no Docker Desktop) to a seeded local database, passing E2E tests, and a dev server that no longer touches production. Use when the user says /setup-local-dndkeep, "set up the local db", "point my machine at docker", or "I want to develop without touching prod".
---

# setup-local-dndkeep

Interactive setup wizard for DNDKeep's opt-in local environment. Assume
nothing is installed. Verify every step before moving on; never skip a
verification because the previous command "looked fine". The user may be
non-expert — explain what each step does in one sentence as you go.

**Contract to state up front:** this is entirely opt-in and per-machine.
Skipping it changes nothing — `.env` → production keeps working exactly as
today. Everything here is reversible by deleting one gitignored file.

## Steps

1. **Docker Desktop present?** — `docker --version`.
   - Absent → offer `winget install Docker.DockerDesktop` (needs a UAC
     click and possibly a reboot/WSL2 enablement — tell the user before
     starting). After install, Docker Desktop must be OPENED once to
     finish WSL setup.
   - *Verify:* `docker --version` prints a version.

2. **Docker engine running?** — `docker info` answering (not just the CLI
   existing). If it hangs or errors: start Docker Desktop
   (`Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'`)
   and poll `docker info` — cold WSL2 boots can take minutes. If it never
   answers, a Docker GUI dialog (license/WSL update) is probably waiting —
   ask the user to check the Docker window.
   - *Verify:* `docker info` shows a Server Version.

3. **Dependencies** — `npm install` in the repo (brings the supabase CLI
   as a devDependency; no global install).
   - *Verify:* `npx supabase --version` prints a version.

4. **Start the stack** — `npx supabase start`. First run pulls a few GB of
   images — run it in the background and tell the user it's a one-time
   wait. Prints API URL + keys when up.
   - *Verify:* output includes `"API_URL":"http://127.0.0.1:54321"`.

5. **Migrations + seed** — `npx supabase db reset`. Replays every
   migration (including the drift shims — see `e2e/README.md` for why
   they exist) and `supabase/seed.sql`.
   - *Verify:* exits with "Reset local database", and
     `docker exec supabase_db_dndkeep psql -U postgres -d postgres -tc
     "select email from auth.users"` shows `test-dm@dndkeep.local`.

6. **Point the app locally** — `copy .env.local.example .env.local`
   (values are pre-filled; the local anon key is deterministic and not a
   secret). Vite loads `.env.local` over `.env` — that one file IS the
   switch. Restart `npm run dev` if it was already running.
   - *Verify:* sign in in the app as `test-dm@dndkeep.local` /
     `dndkeep-local-test` and see **"Local Test Campaign"**. That login
     does not exist in production, so success PROVES the app is local.

7. **Prove the E2E tier (optional but recommended)** —
   `E2E_DB=1 npx playwright test` → expect all tests passing including
   the `db/` flows. If Playwright's browser is missing:
   `npx playwright install chromium`.

8. **Teach the exits** — before finishing, make sure the user knows:
   - Back to prod: delete `.env.local`.
   - Wipe/reseed local data: `npx supabase db reset`.
   - Browse the local DB: <http://localhost:54323> (Studio).
   - Free the RAM: `npx supabase stop`.

## Troubleshooting

The failure modes actually hit during first bring-up are documented with
fixes in `docs/LOCAL_DEV.md` § Troubleshooting (Docker daemon down, `.vs/`
EBUSY, port conflicts, drift-symptom profile fetch). Route there rather
than improvising.

## Hard rules

- Never write `.env` (production values) — only ever create/delete
  `.env.local`.
- Never run DB-writing tests (`E2E_DB=1`) unless step 6's verification
  proved the app is on the local stack.
- Installing Docker Desktop needs the user present (UAC + possible
  reboot); don't attempt it unattended.
