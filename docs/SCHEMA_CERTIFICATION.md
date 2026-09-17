# Schema comparison — September 16, 2026

Compared the production and hosted-test `public` catalogs using
`scripts/schema-inventory.sql`: 2,612 production entries versus 2,591 test entries
before remediation, with 36 named differences. This is metadata only; no user
data or credentials are exported. Hashes deliberately retain formatting so
differences require review instead of being silently normalized away.

## Confirmed behavior gaps and remediation

Migration `20260916235324_converge_creature_schema.sql` restores:

- Four foreign keys: creature campaign, owner, source monster, and token creature.
- Seven indexes for folders, creature ownership/campaign, and token linkage.
- Campaign-member folder reads and visible-creature reads; owner writes remain
  owner-only. Hidden creatures remain hidden unless an existing public/owner
  policy independently grants access.
- Creature JSON array defaults and the existing production visibility default.
  Existing values are preserved; the application already explicitly defaults
  new creatures to visible.
- Both timestamp triggers and a fixed search path for their invoker function.
- Combat linking through the unified creature table, including legacy `npc` and
  `monster` aliases. The replay version referenced the deleted `npcs` table and
  did not handle `creature`, producing zero-stat custom combatants.

Hosted test migration run `35164595919` passed. The transaction-scoped integration
test `scripts/check-creature-schema.sql` failed before migration on the creature
snapshot assertion and passed afterward. It verifies actual authenticated owner,
member, unrelated-user and anonymous access; three combat type aliases reuse one
combatant with correct HP; timestamps advance; an orphan source is rejected.
Zero fixture accounts remain. No emails are sent by these SQL fixtures.

## Remaining differences (not an automatic synchronization list)

After remediation on test, 15 fingerprints differ from pre-remediation prod:

- `cp_ensure_combatant_link` and `touch_updated_at`: the two intended pending
  production changes in this migration.
- Seven functions differ in comments, line endings, layout or equivalent
  branching: `declare_save_batch`, `enforce_scene_limit`, `handle_new_user`,
  `join_campaign_by_code`, `set_campaign_join_code`, `set_campaign_scene_limit`,
  `set_updated_at`. Bodies were manually reviewed; these are not missing APIs.
- The two `campaigns_seconds_per_round_*` constraint names have the identical
  validated 1–600 expression. Rename-only drift; no behavior change needed.
- Production-only `parse_breath_option(text)` and
  `split_breath_weapons_desc(text)`, plus their ACL entries, remain unclassified.
  Do not copy or delete them until callers/dependencies are reviewed.

## Repeating the comparison

Export each SQL result as a bare JSON array, for example with a deliberately
selected local container:

```powershell
docker exec -i <local-db-container> psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -f /tmp/schema-inventory.sql > local.json
node scripts/compare-schema.mjs local.json hosted-test.json
```

Copy the inventory SQL into that container first. For hosted databases use the
read-only SQL connector and save the `inventory` array. Comparator exit 0 means
identical fingerprints, 1 means differences, 2 means invalid input. Empty exports
and duplicate object names fail closed. Its regression tests run in `npm run verify`.

This inventory covers public columns, constraints, indexes, RLS flags/policies,
table grants, application function definitions/ACLs and non-internal triggers.
It does **not** certify data parity, extension-owned functions, storage policies,
Auth-schema triggers, default privileges, publication membership, or hosted Auth
configuration. Different PostgreSQL versions can also render definitions
differently. A fresh local replay comparison remains pending: Docker Desktop
could not start during this follow-up. The previous 173-file replay passed;
the new 174th migration has been tested on hosted test only.

## Release configuration blocker

The production `/auth/v1/settings` endpoint returned `disable_signup: false`,
`mailer_autoconfirm: false`, email provider enabled and anonymous users disabled.
The invite-only UI therefore does not enforce invite-only account creation.
In the production Supabase Dashboard, Authentication settings, disable **Allow
new users to sign up**, then verify `disable_signup: true` through the settings
endpoint. Existing users and administrator invitations should be checked after
the change. No management-configuration tool is available in this session.
Preview environment isolation and redirect allowlists remain unverified.
