-- v2.399.0 — Per-turn attack counter for multiattack support.
--
-- Background. Pre-v2.399, combat_participants had three boolean
-- action-economy flags (action_used / bonus_used / reaction_used)
-- but no concept of "how many attack swings does an Action grant?"
-- An Ancient Red Dragon's Multiattack is "1 bite + 2 claws" —
-- three attacks consuming one Action. A Fighter with Extra Attack
-- gets 2 attacks per Attack action. Without a counter we either
-- cap at 1 attack/turn (wrong for everyone with multiattack) or
-- ungated (the current state, which lets the DM fire infinite
-- attacks).
--
-- Schema: two integer columns on combat_participants.
--   attacks_per_action — the multiattack count for this creature.
--                        Set on insert based on heuristics:
--                          monsters with "multiattack" in any
--                          action name → 3
--                          PCs with Fighter L5+ → 2 (will be
--                          extended for L11/L20 in a later ship)
--                          default → 1
--                        DM can edit per-creature later via UI.
--   attacks_remaining   — what's left this turn. Decremented on
--                         each attack pick. When it hits 0, the
--                         action is fully spent and the boolean
--                         action_used flag also flips true.
--                         Reset to attacks_per_action on turn
--                         start (advanceTurn).
--
-- Both default 1 so existing rows behave identically to before
-- (one attack per turn = the safe pre-multiattack baseline).
-- A separate ship will backfill multiattack counts from monster
-- action data; for now the DM can manually bump it.

ALTER TABLE public.combat_participants
  ADD COLUMN IF NOT EXISTS attacks_per_action int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS attacks_remaining  int NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.combat_participants.attacks_per_action IS
  'v2.399 — How many attacks this creature gets per Action (Multiattack count). Default 1.';
COMMENT ON COLUMN public.combat_participants.attacks_remaining IS
  'v2.399 — Attacks left this turn. Decrements per attack; resets to attacks_per_action on turn start.';
