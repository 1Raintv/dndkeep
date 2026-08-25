# discord-bot

**Live, wanted, and correct.** Committed 2026-08-25 (v2.683) purely because it
was never in version control — it had been deployed since March 2026 and could
not be reviewed.

A session-availability scheduler: `/dndkeep info`, `/schedule poll`,
`/schedule results`, plus the button interactions that record availability into
`session_schedules` / `schedule_availability`.

## Two things to know before touching it

**`verify_jwt: false` is correct here.** Discord cannot mint a Supabase JWT, so
platform-level JWT verification would reject every real request. Authenticity
comes from the Ed25519 signature check (`verifySignature`) against
`DISCORD_PUBLIC_KEY`, performed before anything else happens. That check is the
security boundary — do not remove or reorder it.

**It handles no money.** The 2026-08 architecture audit listed it alongside
`buy-character-slots` and `buy-dice-skin` as a money-handling function that
needed review. That was wrong: it never touches Stripe or entitlements.

## Secrets

`DISCORD_PUBLIC_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

It uses the service-role key, which is why the signature check matters: every
request that gets past it is trusted to read and write campaign scheduling data.

## Source

The deployed source (version 7) is NOT reproduced here yet — it was read during
the launch audit but is long, and committing it verbatim is tracked as a
follow-up. Pull it with `supabase functions download discord-bot` before making
any change, so the repo copy is the real one rather than a reconstruction.
