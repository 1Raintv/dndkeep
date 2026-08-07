# Local development database (optional)

By default this app develops against the **shared production Supabase**
(`.env`). That works and nothing requires you to change it — if you're
happy with the current workflow, you can stop reading.

This doc is for opting a machine into a **local Docker database** instead:
full schema, seeded test login, zero risk to real data, and it unlocks the
DB-backed E2E tests. The switch is per-machine and reversible in one file.

## How the switching works

Vite loads `.env.local` *over* `.env`. A machine **with** a `.env.local`
pointing at `127.0.0.1` talks to its local Docker stack; a machine
**without** one keeps using `.env` → production. `.env.local` is
gitignored — nothing you do here affects anyone else's checkout, deploys,
or the committed defaults.

## Prerequisites

- **Docker Desktop**, running (first setup downloads a few GB of images)
- That's it — the Supabase CLI is a devDependency of this repo
  (`npx supabase …`), no global install.

## Setup (once per machine)

```bash
npx supabase start      # boots Postgres/Auth/REST/Studio in Docker
npx supabase db reset   # replays all migrations + seeds test data
copy .env.local.example .env.local
npm run dev
```

Sign in with the seeded account:

| | |
|---|---|
| Email | `test-dm@dndkeep.local` |
| Password | `dndkeep-local-test` |
| Entitlements | Pro (campaign creation is Pro-gated *at the database*) |
| Data | owns **"Local Test Campaign"** (dm membership auto-created) and **"Seeded Fighter"** (a Fighter 1 character — only 5 columns lack defaults, the rest come from the schema) |

Anything you create locally is yours to trash: `npx supabase db reset`
returns the database to the seeded state in seconds.

## Battle-map fixture (optional, but you want it)

`seed.sql` stops at "a login, a campaign, a character" — enough for the
sheet, nothing for the map. One command furnishes every local campaign
with a map worth testing:

```bash
node scripts/seed-battlemap.mjs
```

It applies `supabase/seed/battlemap-fixture.sql` and generates + uploads
the fixture's images (scene background, a few token portraits) to the
local storage bucket. Re-run it any time — every row it writes has a
deterministic id, so it rebuilds exactly its own rows and leaves
whatever else you made alone. Re-run it after every `db reset`.

What you get, per campaign:

| | |
|---|---|
| **"Ruined Keep (fixture)"** | 30×20 @70px, `dark` ambient light, background image. Three rooms + corridors, 27 walls including a **closed**, an **open** and a **locked** door, a sight-only curtain and a movement-only set of bars |
| Tokens | 14 — the party (blue, one per PC), a tiny ally, three goblin instances off *one* creature row, a 2×2 ogre, a 3×3 dragon, a 4×4 colossus, and one hidden-from-players assassin |
| Annotations | one of each drawing kind (pencil/line/rect/circle) + room labels |
| **"Overland Trail (fixture, hex)"** | hex grid, bright light, **unpublished** — for the hex renderer and the publish gate |
| Creature library | 7 creatures in a 3-folder tree, plus 6 SRD monsters in the shared catalog for the bestiary / catalog-import flows |
| Party | three level-5 PCs; the cleric starts damaged (21/38) so HP bars and healing have something to show |

Tokens are written to `scene_tokens` only — the v2.389 sync trigger
mirrors them into `combatants` + `scene_token_placements`, so the fixture
is correct whether or not the campaign has
`use_combatants_for_battlemap` on.

A **second account** comes with it, so you can open the same map as DM in
one window and as a player in another (fog-of-war per player, published-
scene gating, drag permissions):

| | |
|---|---|
| Email | `test-player@dndkeep.local` |
| Password | `dndkeep-local-test` |
| Data | joins every local campaign as `player` and owns one PC per campaign (its token is drag-enabled for that account) |

The script refuses to run unless `.env.local` points at
127.0.0.1/localhost, so it can never reach production.

## Day-to-day

| Task | Command |
|---|---|
| Wipe + reseed the database | `npx supabase db reset` |
| Re-lay the battle-map fixture | `node scripts/seed-battlemap.mjs` |
| Browse the DB in a UI | Studio at <http://localhost:54323> |
| Stop the stack (frees RAM) | `npx supabase stop` |
| Back to the production DB | delete `.env.local` (dev server restarts itself) |
| Run the DB-backed E2E tests | `E2E_DB=1 npx playwright test` (see `e2e/README.md`) |

## Why there are "drift shim" migrations

Production's schema partly predates the migration files — several tables,
28 columns, and the API-role grants were created directly in the Supabase
Dashboard and never captured as migrations. A fresh replay therefore
needed four reconstruction shims (`000_initial_schema`,
`003_drift_shim_session_states`, `20260803990000_…dashboard_columns`,
`20260803991000_…grants`). They're inert on production — prod never
replays this chain — and guarded with `if not exists` besides. Details in
each file's header and `e2e/README.md`.

The shims were censused by diffing the generated production types
(`src/types/supabase.ts`) against a replayed local schema, which covers
every column the app actually queries. They are a faithful
*reconstruction*, not a certified byte-for-byte copy of production — the
gold-standard cleanup (dumping prod's schema as a verified baseline)
needs the production DB password and lives on the go-live checklist.

## Optional: Visual Studio support

Prefer full Visual Studio over VS Code/terminal? Same philosophy as
`.env.local`: **per-machine, nothing committed**. The repo deliberately
ships no `.sln`/`.esproj` — VS project files are local-only, hidden from
git via `.git/info/exclude` (a per-clone ignore list that, unlike
`.gitignore`, is never committed). That also keeps them out of
`deploy.bat`'s `git add .`.

**No drift risk for anyone**: the `.esproj` format is glob-based — it
lists zero files, Solution Explorer just mirrors the folder on disk. A
teammate adding/renaming/deleting files without VS changes nothing here;
`git pull` and the new files simply appear. The wrapper never needs
maintenance to track the repo.

Heads-up: plain **Open Folder doesn't cut it** — Task Runner Explorer
(even with the NPM Task Runner extension) only activates with a real
project loaded. Hence the wrapper project. (This recipe was proven on
VS 2026 Professional 18.8; VS 2022 17.x should match modulo the `.sln`
vs `.slnx` default.)

1. Requires the **"JavaScript and TypeScript development tools"**
   component (VS Installer → Modify). For npm scripts in Task Runner
   Explorer, also install the **NPM Task Runner** extension
   (Mads Kristensen — skip its "Bindings" feature; those write into the
   tracked `package.json`).
2. Create `dndkeep.esproj` in the repo root:

   ```xml
   <Project Sdk="Microsoft.VisualStudio.JavaScript.Sdk/1.0.6237341">
     <!-- Local-only VS wrapper for the Vite app. NOT tracked by git:
          listed in .git/info/exclude so deploy.bat's `git add .` never sees it. -->
     <PropertyGroup>
       <StartupCommand>npm run dev</StartupCommand>
       <JavaScriptTestRoot>src\</JavaScriptTestRoot>
       <JavaScriptTestFramework>Vitest</JavaScriptTestFramework>
       <!-- F5 runs the dev server; don't let VS's Build invoke vite build -->
       <ShouldRunBuildScript>false</ShouldRunBuildScript>
       <BuildOutputFolder>$(MSBuildProjectDirectory)\dist</BuildOutputFolder>
       <!-- Solution Explorer decluttering (display only — every tool reads the
            filesystem directly, so hiding here changes nothing about builds):
            1) tool output + scratch that git already ignores
            2) root config/deploy files re-homed into the .slnx's virtual
               /config/ and /deploy/ solution folders -->
       <!-- Single line on purpose: MSBuild does not trim whitespace around
            ';' separators, so a wrapped value breaks the glob matching. -->
       <DefaultItemExcludes>$(DefaultItemExcludes);dist\**;playwright-report\**;test-results\**;obj\**;deploy.lock;deploy-log.txt;*.tsbuildinfo;tsconfig.json;tsconfig.node.json;vite.config.ts;playwright.config.ts;eslint.config.js;postcss.config.js;tailwind.config.js;vercel.json;launch.json;deploy.bat;lint.bat;setup.js;DEPLOYMENT.md;install-watcher.bat;uninstall-watcher.bat;watch-and-deploy.ps1;dndkeep.slnx;dndkeep.esproj</DefaultItemExcludes>
     </PropertyGroup>
   </Project>
   ```

   And `dndkeep.slnx` next to it — the virtual `/config/` and
   `/deploy/` solution folders regroup root-level files that their
   tools force to live at the repo root; the `DefaultItemExcludes`
   above hides the same files from the project glob so each appears
   exactly once in Solution Explorer:

   ```xml
   <Solution>
     <!-- Machine-local VS wrapper (in .git/info/exclude — never committed).
          Solution folders below are VIRTUAL groupings of root files that
          their tools require to live at the repo root; the esproj hides the
          same files from the project glob so each appears exactly once. -->
     <Folder Name="/config/">
       <File Path="tsconfig.json" />
       <File Path="tsconfig.node.json" />
       <File Path="vite.config.ts" />
       <File Path="playwright.config.ts" />
       <File Path="eslint.config.js" />
       <File Path="postcss.config.js" />
       <File Path="tailwind.config.js" />
       <File Path="vercel.json" />
       <File Path="launch.json" />
     </Folder>
     <Folder Name="/deploy/">
       <File Path="deploy.bat" />
       <File Path="lint.bat" />
       <File Path="setup.js" />
       <File Path="DEPLOYMENT.md" />
       <File Path="install-watcher.bat" />
       <File Path="uninstall-watcher.bat" />
       <File Path="watch-and-deploy.ps1" />
     </Folder>
     <Project Path="dndkeep.esproj">
       <Build />
       <Deploy />
     </Project>
   </Solution>
   ```

   (Both are display-level conveniences — new repo files still appear
   automatically via the project glob; only the specific files named
   above are re-homed or hidden. If a listed file is ever renamed or
   deleted upstream, just drop its line. The `/config/` folder lists
   `launch.json` — create it per step 5 *before* first opening the
   solution so the reference resolves.)

3. Hide it from git — append to `.git/info/exclude`:

   ```
   dndkeep.esproj
   dndkeep.esproj.user
   dndkeep.sln
   dndkeep.slnx
   launch.json
   obj/
   ```

   (`obj/` is MSBuild's intermediate output — the esproj build drops
   cache files there on first Build/Start.)

4. **File → Open → Project/Solution** → `dndkeep.slnx` (first load
   restores the JavaScript SDK from NuGet). Right-click the
   project → **Set as Startup Project** (a fresh solution can come up
   with none assigned, which alone makes Start fail).

5. F5/Start needs a debug launch profile — without one you get "Unable
   to start debugging. The startup project cannot be launched." Create
   `launch.json` (same schema as VS Code's, excluded above) in the repo
   root, **mirrored at `.vscode/launch.json`** — which location a given
   VS build reads varies, and `.vscode/` is already gitignored:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "msedge",
         "request": "launch",
         "name": "localhost (Edge)",
         "url": "http://localhost:5173",
         "webRoot": "${workspaceFolder}",
         "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
       }
     ]
   }
   ```

   `skipFiles` matters here: `@supabase/auth-js` throws (and internally
   handles) `NavigatorLockAcquireTimeoutError` during routine auth-token
   lock contention; without it the debugger false-positives that as an
   unhandled exception on every launch.

   Restart VS after adding it (profile discovery happens at project
   load), then pick the profile from the Start button's dropdown. If
   the dropdown still only shows "Start", use **"dndkeep Debug
   Properties"** in that same dropdown — the profile editor is the
   authoritative view, and profiles created there always take. If the
   browser opens before Vite is up, start `dev` from Task Runner
   Explorer first — with a `launch.json` present VS may not auto-run
   `StartupCommand`.

You get: **F5/Start** = debug browser attached to the Vite app
(breakpoints in `src/` bind via sourcemaps), and **Task Runner
Explorer** listing every `package.json` script (double-click to run —
the gate scripts included). Verify invisibility with `git status`
(clean) or `git check-ignore -v dndkeep.esproj`.

Solution Explorer shows the folder's real contents (minus the
`DefaultItemExcludes` decluttering above) — so anything else gitignored
that VS surfaces is expected, not a tracking bug.

## Troubleshooting

- **`failed to connect to the docker API`** — Docker Desktop isn't
  running (the CLI being installed isn't enough; the whale needs to be
  up).
- **Dev server crashes with `EBUSY …/.vs/…`** — shouldn't happen anymore
  (Vite ignores `.vs/` since v2.638), but if you see it: Visual Studio
  holds exclusive locks on its index files; make sure you're on a build
  that includes the `vite.config.ts` watcher ignores.
- **Ports 54321–54324 already in use** — another Supabase project's
  stack is running; `npx supabase stop --project-id <other>` or stop it
  from Docker Desktop.
- **App shows "Subscribe to create campaigns" for the test user** — the
  profile fetch is failing; almost always a schema-drift symptom. Run
  `npx supabase db reset` (picks up any new shims), and if it persists,
  compare `src/types/supabase.ts` against local `information_schema`
  columns — a single missing column 400s the whole profile select.
- **Stuck on "Loading…", then "taking longer than usual", console says
  `Missing Supabase environment variables`** — the dev server was started
  BEFORE `.env.local` was created. Vite reads env files once at startup
  and never re-reads them, so a server that predates the file serves the
  app with no credentials at all — `.env.local` looks correct on disk the
  whole time. Restart the dev server. (Confirm with the process start
  time vs. the file's mtime; they'll be minutes-to-hours apart.)
- **A config change has no effect even after restarting the dev server
  and reloading** — the service worker (`public/sw.js`) is serving a
  cached bundle, and its cache survives both. Two tells: the console
  error names a file you already fixed, and the version banner at boot
  doesn't match `src/version.ts` (a cache named `dndkeep-v<prod version>`
  means you're being served production assets, not your local build).
  Clear it from the DevTools console, then reload:

  ```js
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
  ```

  Keep those as two separate statements — chaining them into one
  `async` IIFE means an early throw silently skips everything after it.
- **Signed in, but the app acts like a different (empty) account —
  "No characters yet", and the network tab shows
  `profiles?id=eq.<some other uuid>` returning 406** — your browser is
  holding a JWT for a user id that no longer exists. Any operation that
  rewrites `auth.users.id` does this: `npx supabase db reset` (rebuilds
  the seeded user), or cloning prod data under your local account. RLS is
  `uid() = id`, so the orphaned token matches no profile row, `.single()`
  404s into a 406, and every derived flag falls back to its default
  (`show_ua_content` → false, which quietly hides UA classes like Psion).
  Signing out via the UI often can't fix it — that path needs the profile
  it can't fetch — so clear storage directly and sign in again:

  ```js
  localStorage.clear(); sessionStorage.clear(); location.reload();
  ```
