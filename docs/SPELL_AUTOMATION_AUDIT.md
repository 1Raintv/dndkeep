# Spell & Ability Automation Audit — v2.596.0

Goal: identify every spell / class feature / subclass feature with a **lasting or
recurring effect** worth surfacing automatically (turn-facing prompts, map
tokens, ongoing damage ticks, escape checks). No rules changes — only making
the existing RAW mechanics impossible to forget. Compiled by pattern-scanning
all 399 catalogue descriptions (`bonus action` recurrence, `start of turn`
triggers, repeat saves, summon/surface language) plus a manual pass. Verify
each line; check the box when approved for the automation backlog.

Legend: **[P]** turn-facing prompt · **[T]** map token/area · **[D]** ongoing
damage/heal tick · **[S]** save/escape tracking · **[H]** HP-pool tracking

---

## Tier 1 — Recurring bonus-action / action prompts while active
The Heat Metal pattern: while the spell is up (usually concentration), show an
in-your-face button on the caster's turn.

- [ ] **Heat Metal** (2) — [P][D] BA each turn: re-deal 2d8 fire; victim holding it takes the drop/disadvantage rules. Start-of-turn contact damage too.
- [ ] **Spiritual Weapon** (2) — [P][T] BA: move 20 ft + attack. Token on map.
- [ ] **Flaming Sphere** (2) — [P][T][D] BA: move 30 ft, ram → DEX save; creatures ending turn within 5 ft save. Token on map.
- [ ] **Moonbeam** (2) — [P][T][D] Action (2024: Magic action) to move 60 ft; creatures entering/starting turn in beam save.
- [ ] **Witch Bolt** (1) — [P][D] BA (2024): re-deal 1d12 on a later turn.
- [ ] **Call Lightning** (3) — [P] Action each turn: another bolt.
- [ ] **Bigby's/Arcane Hand** (5) — [P][T] BA: move + choose hand mode (clench/forceful/grasping/interposing).
- [ ] **Animate Objects** (5) — [P][T] BA: command all animated objects.
- [ ] **Arcane/Mordenkainen's Sword** (7) — [P][T] BA: move 20 ft + attack.
- [ ] **Eyebite** (6) — [P] Action each turn: target another creature.
- [ ] **Sunbeam** (6) — [P] Action each turn: another beam.
- [ ] **Telekinesis** (5) — [P] Action each turn: sustain/re-target contest.
- [ ] **Vampiric Touch** (3) — [P] Attack each turn as the touch persists.
- [ ] **Aura of Vitality** (3) — [P] BA each turn: heal 2d6.
- [ ] **Flame Blade** (2) — [P] BA to re-summon blade; attack with it.
- [ ] **Shadow Blade** (2) — [P] BA to re-form the blade if dropped/dismissed.
- [ ] **Crown of Madness** (2) — [P][S] Action each turn to maintain control; target repeats save each turn.
- [ ] **Compulsion** (4) — [P][S] BA each turn: designate direction; save each turn.
- [ ] **Dominate Beast / Person / Monster** (4/5/8) — [P][S] Action for precise control; repeat save on damage.
- [ ] **Dancing Lights** (0) — [P][T] BA: move lights 60 ft.
- [ ] **Mage Hand** (0) — [P][T] Action: control hand (30 ft).
- [ ] **Unseen Servant** (1) — [P][T] BA: command tasks.
- [ ] **Hex** (1) — [P] BA on a later turn: move curse when target drops to 0.
- [ ] **Hunter's Mark** (1) — [P] BA on a later turn: move mark.
- [ ] **Expeditious Retreat** (1) — [P] BA each turn: Dash.
- [ ] **Mislead / Project Image** (5/7) — [P] Action/BA: move & control the illusion; swap senses.
- [ ] **Arcane Eye** (4) — [P] Action: move the eye 30 ft.
- [ ] **Psion: Thought-Form** — [P] Recurring commands (already flagged in pattern scan; homebrew-scoped).

## Tier 2 — Map tokens & persistent areas
Cast → auto-place a token/area on the active battle map; ties into the Track 2/3
renderer. Areas also power Tier 3 ticks.

**Mobile summons (token + action economy):** Flaming Sphere · Spiritual Weapon ·
Bigby's Hand · Arcane Sword · Dancing Lights · Mage Hand · Unseen Servant ·
Arcane Eye · Find Steed · Faithful Hound (static ambush trigger) · Guardian of
Faith (static, 10-ft trigger, **60 HP damage pool** [H]) · Delayed Blast
Fireball (growing bead, 1d6/turn growth [D]).

**Summon-series creature tokens (2024 statblock riders):** Summon Beast / Fey /
Undead / Shadowspawn / Elemental / Construct / Celestial / Dragon / Fiend ·
Conjure Elemental / Fey / Celestial (2024 versions are areas/effects — verify
per-spell) · Animate Dead / Create Undead (persistent minions + daily
re-command [P]).

**Static areas (enter/start-turn triggers):** Web [S] · Entangle [S] · Grease
[S] · Spike Growth (movement damage [D]) · Cloud of Daggers [D] · Moonbeam [D]
· Spirit Guardians (emanation follows caster [D]) · Stinking Cloud [S] ·
Cloudkill (moves 10 ft/round away [D]) · Sleet Storm · Insect Plague [D] ·
Black Tentacles [D][S] · Hunger of Hadar [D] · Wall of Fire [D] · Wall of
Thorns [D] · Blade Barrier [D] · Wall of Ice [D] · Wall of Stone · Fog Cloud ·
Hypnotic Pattern [S] · Zone of Truth [S] · Silence · Darkness · Incendiary
Cloud [D] · Forbiddance [D] · Ice Storm (terrain) · Gust of Wind ([P] BA to
change direction).

## Tier 3 — Ongoing per-turn damage / heal / save ticks
Hook into the existing start-of-turn automation pipeline (same slot as
`death_save_on_turn_start`).

- [ ] **Acid Arrow** — [D] damage at end of target's **next** turn (one-shot delayed tick).
- [ ] **Ensnaring Strike** — [D][S] 1d6 at start of turn while Restrained; STR (Athletics) escape action.
- [ ] **Heroism** — [D-inverse] temp HP = mod at the **start of each of the target's turns**.
- [ ] **Regenerate** — [D-inverse] 1 HP at the start of each turn (10 HP/min out of combat).
- [ ] **Armor of Agathys** — [H] temp HP pool + auto-retaliate 5×slot cold when hit in melee while pool > 0.
- [ ] **Searing Smite** — [D][S] 1d6 fire at start of turn, save ends.
- [ ] **Sanctuary** — [S] attacker WIS save gate before targeting the warded creature.
- [ ] **Phantasmal Force** — [D][S] 1d6 psychic per turn; Investigation action to escape.
- [ ] **Confusion** — [S] roll the behavior table at the start of each affected turn; repeat save at end.
- [ ] **Fear / Hypnotic Pattern / Hold Person / Hold Monster / Tasha's Hideous Laughter** — [S] repeat-save scheduling (condition system already tracks the condition; add the automatic save prompt at the right timing per spell).
- [ ] **Flesh to Stone** — [S] progressive failure tracking (3 fails → petrified; 3 saves → free).
- [ ] **Bestow Curse** — [D] optional extra 1d8 necrotic on caster hits; turn-economy curse options.
- [ ] **Levitate** — [P] restrained-altitude control each turn (2024: move it as part of your move).
- [ ] **Blinding Smite / Power-word-stun / Sunburst / Prismatic Spray / Synaptic Static / Psychic Scream / Enemies Abound / Yolande's Regal Presence** — [S] repeat-save scheduling.

## Class & subclass features

- [ ] **Druid — Wild Shape** — [H][P] the headline item: swap to the form's HP pool, keep caster HP underneath, excess damage carries over on revert; one-click **Revert (BA — 2024: free on your turn? verify: 2024 uses BA to shape-shift, revert as BA or on 0 HP)**; block spellcasting per rules; timer on duration (½ level hours).
- [ ] **Circle of the Moon — Improved forms** — [H] same pool machinery, higher CR forms + bonus-action healing (Lunar Radiance/2024 features — verify SRD scope).
- [ ] **Circle of Spores — Symbiotic Entity** — [H][D] temp HP pool (4×level) + Halo of Spores reaction damage prompt.
- [ ] **Circle of Wildfire — Wildfire Spirit** — [T][P] summon token + BA command (non-SRD: paraphrase scope).
- [ ] **Barbarian — Rage** — [P] active-rage tracker: rounds counter, damage bonus applied to STR attacks, resistance chip, **end-of-turn check** (2024: ends if you haven't attacked/taken damage and don't use BA to extend); one-click extend prompt.
- [ ] **Barbarian — Relentless Rage** — [S] auto-prompt CON save on dropping to 0 while raging (DC 10, +5 escalation, resets on rest).
- [ ] **Fighter — Second Wind / Action Surge** — [P] already tracked as uses; add the in-turn prompt surfacing when available (low priority).
- [ ] **Monk — Patient Defense / Step of the Wind / Flurry** — [P] BA prompt row showing Focus costs on the monk's turn.
- [ ] **Paladin — Lay on Hands** — [H] pool tracker (exists? verify) + BA prompt (2024: BA).
- [ ] **Paladin — Divine Smite (2024 spell)** — [P] post-hit prompt: offer smite on melee hit (1/turn leveled-spell gate already enforced).
- [ ] **Cleric/Paladin — Channel Divinity** — partial recharge on short rest (open roadmap item #5) + turn prompts for Divine Spark/Sacred Weapon durations.
- [ ] **Bard — Bardic Inspiration** — [P] track the die held by each ally (10-min expiry), prompt the holder when rolling d20 tests.
- [ ] **Sorcerer — Innate Sorcery** — [P] duration tracker (1 min) + active chip.
- [ ] **Warlock — Hex + invocation riders** — covered in Tier 1; add Pact of the Chain familiar token [T].
- [ ] **Wizard — Portent (Divination)** — [P] stored-roll slots, spend prompt on any visible d20 test (non-SRD subclass: paraphrase scope).
- [ ] **Artificer — Eldritch Cannon / Steel Defender / Homunculus** — [T][P][H] token + BA command + own HP pool (Eberron-sourced: paraphrase scope).
- [ ] **Ranger — Beast Master companion** — [T][P][H] token, command action economy, HP pool.
- [ ] **Psion disciplines** — sweep for recurring-action patterns (thought-form already flagged; owner-scoped homebrew).

## Already covered (no new work)
Concentration-on-damage checks · condition cascade + save-ends conditions
(base tracking) · opportunity-attack offers · Absorb Elements rider ·
death saves on turn start · willing-ally auto-fail · cross-encounter
condition immunities.

## Suggested build order
1. **Recurring-prompt framework** (one generic "active effect → turn prompt"
   registry; Heat Metal, Spiritual Weapon, Aura of Vitality, Hex/HM movers,
   Call Lightning ride it for free). Biggest UX win per line of code.
2. **Wild Shape HP pool + revert** (self-contained, high table impact).
3. **Token-on-cast for mobile summons** (Flaming Sphere, Spiritual Weapon
   first — pairs with the prompt framework).
4. **Start-of-turn tick pipeline extensions** (Acid Arrow, Heroism,
   Regenerate, Searing Smite, Armor of Agathys retaliation).
5. **Area triggers** (needs map geometry — slots into Track 2/3 work).
