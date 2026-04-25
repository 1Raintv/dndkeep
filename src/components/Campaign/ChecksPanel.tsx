// src/components/Campaign/ChecksPanel.tsx
//
// v2.229.0 — Extracted from PartyDashboard.tsx so the same checks UI
// can be reused on the BattleMapV2 TokenQuickPanel for DM-clicked
// player tokens. The behavior is unchanged from the original
// (PartyDashboard pt 4 lineage); this file is purely a relocation.
//
// Component contract: takes a Character + campaignId, renders a self-
// contained section with skill picker, raw ability buttons, save
// buttons, advantage/disadvantage/DC controls, and two action
// buttons — Roll Secret (private DM roll) and Prompt Player (sends
// a check_prompt or save_prompt via campaign_chat). Last roll result
// is rendered inline below the actions.
//
// DM workflow (lifted from the original PartyDashboard comment):
//   1. Pick a skill (dropdown), raw ability (button), or save (button).
//      Each option shows the character's modifier inline, so the DM
//      doesn't have to flip to a sheet to see that this rogue has
//      Stealth +11.
//   2. Optionally toggle Advantage / Disadvantage / DC.
//   3. Click "🎲 Roll Secret" to roll on the player's behalf and see
//      the result inline. No broadcast — the player has no idea the
//      DM rolled. Useful for hidden Perception, secret Insight, etc.
//   4. Click "📨 Prompt Player" to send a notification that surfaces
//      the roll in the player's dice tray. Check/raw-check targets
//      send check_prompt; save targets send save_prompt so the
//      player sees the proper save banner.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Character, AbilityKey } from '../../types';
import { SKILLS } from '../../data/skills';
import {
  rollCheck, checkModifier, encodeCheckPrompt,
  type CheckTarget, type CheckRollResult,
} from '../../lib/abilityChecks';
import { useDiceRoll } from '../../context/DiceRollContext';

export default function ChecksPanel({ character: c, campaignId }: {
  character: Character;
  campaignId: string;
}) {
  const { triggerRoll } = useDiceRoll();
  const [target, setTarget] = useState<CheckTarget>({ kind: 'skill', name: 'Perception' });
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [dc, setDc] = useState<string>('');
  const [lastResult, setLastResult] = useState<CheckRollResult | null>(null);
  const [promptSent, setPromptSent] = useState(false);

  function setAdv(v: boolean) {
    setAdvantage(v);
    if (v) setDisadvantage(false);
  }
  function setDis(v: boolean) {
    setDisadvantage(v);
    if (v) setAdvantage(false);
  }

  function rollSecret() {
    const result = rollCheck(c, target, { advantage, disadvantage });
    setLastResult(result);
    // Surface visually in DM's 3D dice tray. No broadcast.
    triggerRoll({
      result: result.d20,
      dieType: 20,
      modifier: result.modifier,
      total: result.total,
      label: `${c.name} — ${result.label} (secret)`,
      advantage,
      disadvantage,
    });
  }

  async function promptPlayer() {
    const dcVal = parseInt(dc);
    const dcParam = !isNaN(dcVal) && dcVal > 0 ? dcVal : undefined;

    // v2.168.0 — saves go through save_prompt (existing party-wide
    // banner). Checks still go through check_prompt. We route by
    // target.kind so the player sees the right UI on their end.
    // v2.192.0 — Phase Q.0 pt 33: ChecksPanel is per-character (one
    // panel per row in the DM dashboard), so the DM clicking "Prompt
    // Player" here intends ONLY this player. Embed `targets: [c.id]`
    // in the payload so other players don't see the popup. Without
    // this, every save/check prompt initiated from any character row
    // popped on every player's sheet — annoying for solo skill checks
    // and confusing for save-vs-trap scenarios where only one player
    // is in the trap's area.
    if (target.kind === 'save') {
      // save_prompt requires a DC (player UI shows "needs X more to
      // succeed"). Default to 10 if DM didn't set one.
      const effectiveDc = dcParam ?? 10;
      const abilityFull = target.ability.charAt(0).toUpperCase() + target.ability.slice(1);
      await supabase.from('campaign_chat').insert({
        campaign_id: campaignId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        character_name: 'DM',
        message: JSON.stringify({ ability: abilityFull, dc: effectiveDc, targets: [c.id] }),
        message_type: 'save_prompt',
      });
    } else {
      // check_prompt payload has its own encoder; we extend it inline
      // by parsing the encoded JSON, attaching targets, and re-stringifying.
      // The encoder doesn't know about targets — adding it in here
      // keeps the encoder shape stable for older clients.
      const baseEncoded = encodeCheckPrompt({
        target: target.kind === 'skill' ? target.name : target.ability.slice(0, 3).toUpperCase(),
        kind: target.kind,
        dc: dcParam,
        advantage: advantage || undefined,
        disadvantage: disadvantage || undefined,
      });
      let payload: string;
      try {
        const parsed = JSON.parse(baseEncoded);
        parsed.targets = [c.id];
        payload = JSON.stringify(parsed);
      } catch {
        payload = baseEncoded;
      }
      await supabase.from('campaign_chat').insert({
        campaign_id: campaignId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        character_name: 'DM',
        message: payload,
        message_type: 'check_prompt',
      });
    }
    setPromptSent(true);
    setTimeout(() => setPromptSent(false), 2000);
  }

  // Live preview mod for the currently-selected target (header strip).
  const previewMod = (() => {
    const r = rollCheck(c, target, {});
    return r.modifier;
  })();

  // v2.168.0: precompute modifiers for every option so every button /
  // dropdown entry shows e.g. "STR -1" or "Stealth (+6) ★". Keeps the
  // DM informed without having to click through each one first.
  const abilityKeys: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const rawMods = abilityKeys.map(a => ({
    ability: a,
    ...checkModifier(c, { kind: 'ability', ability: a }),
  }));
  const saveMods = abilityKeys.map(a => ({
    ability: a,
    ...checkModifier(c, { kind: 'save', ability: a }),
  }));
  const skillMods = SKILLS.map(s => ({
    name: s.name,
    ...checkModifier(c, { kind: 'skill', name: s.name }),
  }));

  const fmtMod = (m: number) => `${m >= 0 ? '+' : ''}${m}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>
        Ability Checks
      </div>

      {/* ─── Skills section ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Skills
        </div>
        <select
          value={target.kind === 'skill' ? target.name : ''}
          onChange={e => setTarget({ kind: 'skill', name: e.target.value })}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
        >
          <option value="" disabled>Pick a skill…</option>
          {skillMods.map(s => (
            <option key={s.name} value={s.name}>
              {s.name} ({fmtMod(s.mod)}){s.expert ? ' ★★' : s.proficient ? ' ★' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Raw check section ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Raw check
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {rawMods.map(r => {
            const selected = target.kind === 'ability' && target.ability === r.ability;
            return (
              <button
                key={r.ability}
                onClick={() => setTarget({ kind: 'ability', ability: r.ability })}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', minHeight: 0,
                  border: selected ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
                  background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: selected ? 'var(--c-gold-l)' : 'var(--t-2)',
                  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  fontFamily: 'var(--ff-stat)',
                }}
                title={`Raw ${r.ability} check (no proficiency)`}
              >
                {r.ability.slice(0, 3)} {fmtMod(r.mod)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Saving throws section ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Saving throws
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {saveMods.map(s => {
            const selected = target.kind === 'save' && target.ability === s.ability;
            return (
              <button
                key={s.ability}
                onClick={() => setTarget({ kind: 'save', ability: s.ability })}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', minHeight: 0,
                  border: selected
                    ? '1px solid var(--c-gold-bdr)'
                    : s.proficient
                      ? '1px solid rgba(167,139,250,0.5)'
                      : '1px solid var(--c-border-m)',
                  background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: selected ? 'var(--c-gold-l)' : s.proficient ? '#a78bfa' : 'var(--t-2)',
                  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  fontFamily: 'var(--ff-stat)',
                }}
                title={`${s.ability} save${s.proficient ? ' (proficient)' : ''}`}
              >
                {s.ability.slice(0, 3)} {fmtMod(s.mod)}{s.proficient ? ' ★' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advantage / Disadvantage / DC */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={advantage} onChange={e => setAdv(e.target.checked)} />
          Adv
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={disadvantage} onChange={e => setDis(e.target.checked)} />
          Dis
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>DC</label>
          <input
            type="number" min={1} max={30}
            value={dc} onChange={e => setDc(e.target.value)}
            placeholder="—"
            style={{ width: 40, fontSize: 11, fontFamily: 'var(--ff-stat)', fontWeight: 700, textAlign: 'center', padding: '2px 4px', borderRadius: 5, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
          />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-body)' }}>
          mod {fmtMod(previewMod)}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={rollSecret}
          style={{
            flex: 1,
            fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
            border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
          }}
          title="DM rolls on the player's behalf. Result is private — the player isn't notified."
        >
          🎲 Roll Secret
        </button>
        <button
          onClick={promptPlayer}
          style={{
            flex: 1,
            fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
            border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
          }}
          title={target.kind === 'save'
            ? "Sends a save_prompt so the player sees the save banner on their sheet."
            : "Sends a check_prompt so the player sees the check banner on their sheet."}
        >
          📨 Prompt Player
        </button>
      </div>

      {promptSent && (
        <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, textAlign: 'center' }}>
          Prompt sent
        </div>
      )}

      {/* Last result */}
      {lastResult && (
        <div style={{
          padding: '8px 10px', borderRadius: 7,
          background: 'var(--c-raised)', border: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 18,
            color: lastResult.d20 === 20 ? '#4ade80' : lastResult.d20 === 1 ? '#ef4444' : 'var(--c-gold-l)',
            minWidth: 28, textAlign: 'center',
          }}>
            {lastResult.total}
          </div>
          <div style={{ flex: 1, fontSize: 10, color: 'var(--t-2)', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, color: 'var(--t-1)' }}>
              {lastResult.label}
              {lastResult.proficient && <span style={{ color: 'var(--c-gold-l)', marginLeft: 4 }}>★</span>}
              {lastResult.expert && <span style={{ color: '#a78bfa', marginLeft: 2 }}>★</span>}
            </div>
            <div>
              d20: {lastResult.d20Rolls.join(', ')} → {lastResult.d20}
              {' '}{lastResult.modifier >= 0 ? '+' : ''}{lastResult.modifier} = {lastResult.total}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
