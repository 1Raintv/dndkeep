// v2.100.0 — Phase F of the Combat Backbone
//
// Player-facing in-combat attack button. Mounts on each weapon row in
// WeaponsTracker. Visible only when the character is a participant in an
// active encounter. Clicking drives the flow:
//
//   1. Open target picker
//   2. On target selected: declareAttack()
//   3. Immediately rollAttackRoll() — gets hit/miss, triggers Shield offer
//   4. Stop here. DM's AttackResolutionModal picks up from attack_rolled and
//      walks through damage + apply once all reactions resolve.
//
// Kept deliberately lean — spells, AoE, and multi-target attacks come in
// v2.101+.

import { useState } from 'react';
import { useCombat } from '../../context/CombatContext';
import { declareAttack, rollAttackRoll } from '../../lib/pendingAttack';
import TargetPickerModal from './TargetPickerModal';
import type { CombatParticipant } from '../../types';

interface Props {
  characterId: string;
  /** Attack bonus (includes proficiency, ability mod, magic item bonuses). */
  attackBonus: number;
  /** Damage dice expression like "1d8+3". */
  damageDice: string;
  damageType: string;
  /** Weapon or ability name shown in the log. */
  attackName: string;
  /** 'weapon' | 'spell' | 'ability' — used for attack_source classification. */
  source?: 'weapon' | 'spell' | 'ability';
  /** Optional compact / minimal styling override. */
  compact?: boolean;
}

export default function PlayerAttackButton({
  characterId,
  attackBonus,
  damageDice,
  damageType,
  attackName,
  source = 'weapon',
  compact = false,
}: Props) {
  const { encounter, participants } = useCombat();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  // Find my participant row in the active encounter
  const myParticipant = participants.find(
    p => p.participant_type === 'character' && p.entity_id === characterId
  );

  // Not in combat — render nothing so WeaponsTracker's default Hit/Damage
  // buttons stay the happy path.
  if (!encounter || encounter.status !== 'active' || !myParticipant) return null;

  async function handlePick(target: CombatParticipant) {
    if (busy || !encounter || !myParticipant) return;
    setPicking(false);
    setBusy(true);

    try {
      const attack = await declareAttack({
        campaignId: encounter.campaign_id,
        encounterId: encounter.id,
        attackerParticipantId: myParticipant.id,
        attackerName: myParticipant.name,
        attackerType: 'character',
        targetParticipantId: target.id,
        targetName: target.name,
        targetType: target.participant_type,
        attackSource: source === 'weapon' ? 'weapon' : source === 'spell' ? 'spell' : 'ability',
        attackName,
        attackKind: 'attack_roll',
        attackBonus,
        targetAC: target.ac,
        damageDice,
        damageType,
      });

      if (attack) {
        // Immediately roll the attack. This triggers Shield offers on hit.
        // We intentionally stop here: the DM's AttackResolutionModal takes
        // over from attack_rolled, waits on outstanding reactions, rolls
        // damage, and applies.
        await rollAttackRoll(attack.id);
      }
    } finally {
      setBusy(false);
    }
  }

  const buttonStyle: React.CSSProperties = compact
    ? {
        fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
        padding: '3px 8px', borderRadius: 4,
        border: '1px solid rgba(248,113,113,0.5)',
        background: 'rgba(248,113,113,0.12)',
        color: '#f87171',
        cursor: 'pointer', minHeight: 0,
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }
    : {
        fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
        padding: '5px 12px', borderRadius: 5,
        border: '1px solid rgba(248,113,113,0.5)',
        background: 'rgba(248,113,113,0.12)',
        color: '#f87171',
        cursor: 'pointer', minHeight: 0,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      };

  return (
    <>
      <button
        onClick={() => setPicking(true)}
        disabled={busy}
        title={`Attack a target with ${attackName} — runs full combat resolution`}
        style={buttonStyle}
      >
        {busy ? '…' : `⚔ Attack`}
      </button>
      {picking && (
        <TargetPickerModal
          participants={participants}
          excludeParticipantId={myParticipant.id}
          title={`Attack with ${attackName}`}
          subtitle={`${attackBonus >= 0 ? '+' : ''}${attackBonus} to hit · ${damageDice} ${damageType}`}
          onPick={handlePick}
          onCancel={() => setPicking(false)}
        />
      )}
    </>
  );
}
