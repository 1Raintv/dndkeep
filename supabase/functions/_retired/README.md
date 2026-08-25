# Retired edge functions

Functions that were running in production but are no longer part of the app.
None of these are deployed from this directory — the leading underscore keeps
them out of any `supabase functions deploy` sweep. They live here because none
of them were ever in version control, so deleting them outright would have
erased the only record of what had been running against real users and real
money.

Each was replaced in production with a permanently-refusing 410 stub before
being handed to the owner for outright deletion, so the endpoints are inert
whether or not the deletion has happened yet.

| Function | Retired | Why |
|---|---|---|
| `push-to-github` | 2026-08-25 (v2.681) | Anonymous-reachable (`verify_jwt: false`, CORS `*`) endpoint holding a `GITHUB_TOKEN` that committed caller-supplied files straight to `main`, which auto-deploys. Remote code execution on the live site, guarded only by a static shared key that was also accepted in the request body. A third undocumented deploy path. |
| `buy-character-slots` | 2026-08-25 (v2.683) | Sold a 5-slots-for-$5 pack that existed nowhere else in the app — `entitlements.ts` models single slots to a maximum of 10. Fulfilment was `success_url: /settings?slots_purchased=5`, i.e. the browser landing on a URL was the grant. Superseded by the single `create-checkout` path with webhook fulfilment. |
| `buy-dice-skin` | 2026-08-25 (v2.683) | Sold Obsidian / Dragon Gold / Glacial Ice / Blood Moon at $2.99 while the Store page sold Crimson / Emerald / Sapphire at $2 — two catalogues, two prices, two checkout paths. Same browser-trusting fulfilment via `?skin_unlocked=`. Superseded by the same single path; the dice themselves were replaced in v2.682. |

Both `buy-*` functions got their **authentication** right — anon client plus
`getUser()`, which is the pattern the rewritten functions now use. It was
fulfilment they got wrong, and having two catalogues at all.

**`discord-bot` is NOT retired.** It is still live and still wanted — a session
availability scheduler that verifies Ed25519 request signatures before doing
anything, which is why `verify_jwt: false` is correct for it (Discord cannot
mint a Supabase JWT). Its source is committed at
`supabase/functions/discord-bot/` for review. The 2026-08 audit listed it as
money-handling; it is not, and never was.

## Secrets

Retiring a function does not rotate its secrets. `GITHUB_TOKEN` and `DEPLOY_KEY`
must be treated as disclosed — they sat behind an anonymous endpoint. Tracked in
`docs/MVP_LAUNCH.md`.
