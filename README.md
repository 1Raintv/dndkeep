# DNDKeep

A full-featured D&D 5e session companion for players and dungeon masters.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | CSS custom properties (no framework) |
| Routing | React Router v6 |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Payments | Stripe (Subscriptions + Customer Portal) |
| Deploy | Vercel |

## Features

**Free Tier**
- 1 character with full character sheet
- Spell browser (36 SRD spells)
- Combat tracker with monster library
- Dice roller with session roll log

**Pro Tier**
- Unlimited characters
- Campaign management (DM + player roles)
- Invite players by email
- Real-time multiplayer combat sync (Supabase Realtime)

## Quick Start

```bash
npm install
cp .env.example .env.local
# fill in Supabase + Stripe credentials
npm run dev
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment instructions.

## Project Structure

```
src/
  types/          Core TypeScript interfaces
  data/           D&D 5e static data (classes, spells, monsters, etc.)
  lib/            Supabase client, Stripe helpers, game utilities
  context/        React context (Auth, Campaign)
  styles/         Global CSS design system
  components/
    CharacterSheet/   8 focused sub-components
    CharacterCreator/ 6-step wizard
    Campaign/         Campaign list + dashboard
    pages/            Route-level page components
    shared/           Toast, ProGate
supabase/
  schema.sql        Full DB schema with RLS and triggers
  functions/        Stripe Edge Functions (Deno)
```

## D&D 5e Data (2024 PHB)

- 12 classes with subclasses
- 9 species (traits only, no fixed ASIs)
- 10 backgrounds (each grants +2/+1 ASI)
- 36 SRD spells (cantrips through 5th level)
- 21 monsters with full stat blocks
- 18 skills, 15 conditions
- Full spell slot tables (full / half / warlock progressions)
