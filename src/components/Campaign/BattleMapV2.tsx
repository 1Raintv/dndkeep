// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell.
//
// This component is the target of a ground-up rewrite of the battle map
// using PixiJS v8 + @pixi/react + pixi-viewport, with Supabase Realtime
// for multiplayer sync, and per-player dynamic lighting / fog of war
// planned for later phases.
//
// For v2.208 this is intentionally a placeholder — it renders a
// "coming soon" UI so the feature-flag toggle in CampaignDashboard can
// switch between the existing BattleMap (v1) and this one. Subsequent
// ships will add:
//   v2.209 — install PixiJS deps + mount Application, viewport pan/zoom
//   v2.210 — square grid overlay rendering, snap-to-grid math
//   v2.211 — first draggable token, Zustand state store wired
//   v2.212 — multi-token, size categories, portrait loading from Storage
//   v2.213 — DM-only scene creation / management UI
//
// The v1 BattleMap remains fully functional and is the default until
// v2 reaches feature parity. Campaigns / scenes data is stored under
// the v2-namespaced `scenes` + `scene_tokens` tables (separate from v1's
// `battle_maps`), so there is no risk of cross-contamination during the
// parallel development.

import React from 'react';

interface BattleMapV2Props {
  campaignId: string;
  isDM: boolean;
  userId: string;
  myCharacterId: string | null;
  // Shape mirrors the v1 BattleMap prop so the feature-flag toggle in
  // CampaignDashboard can swap components without reshaping the props.
  playerCharacters: Array<{
    id: string;
    name: string;
    class_name: string;
    level: number;
    current_hp: number;
    max_hp: number;
    armor_class: number;
    active_conditions: string[];
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    speed: number;
  }>;
}

export default function BattleMapV2(_props: BattleMapV2Props) {
  // Mute unused-prop warnings until v2.209 wires the real renderer.
  void _props;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-8, 48px) var(--sp-4, 16px)',
        textAlign: 'center',
        background: 'var(--c-card)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg, 12px)',
        minHeight: 400,
      }}
    >
      <div
        style={{
          fontSize: 48,
          marginBottom: 16,
          filter: 'grayscale(20%)',
        }}
      >
        🗺️
      </div>
      <div
        style={{
          fontFamily: 'var(--ff-body)',
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--t-1)',
          marginBottom: 8,
          letterSpacing: '0.02em',
        }}
      >
        Battle Map v2 — Coming Soon
      </div>
      <div
        style={{
          fontFamily: 'var(--ff-body)',
          fontSize: 13,
          color: 'var(--t-2)',
          maxWidth: 480,
          lineHeight: 1.6,
          marginBottom: 16,
        }}
      >
        A ground-up rewrite using PixiJS for professional-grade performance.
        Coming features: dynamic lighting, per-player fog of war, walls and doors,
        measurement tools, weather effects, animated tokens, and a full in-browser
        scene builder.
      </div>
      <div
        style={{
          fontFamily: 'var(--ff-body)',
          fontSize: 11,
          color: 'var(--t-3)',
          fontStyle: 'italic' as const,
        }}
      >
        Switch back to the v1 map using the toggle above to keep playing.
      </div>
    </div>
  );
}
