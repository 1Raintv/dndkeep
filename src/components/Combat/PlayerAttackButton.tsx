// v2.100.0 — Phase F of the Combat Backbone
//
// Player-facing in-combat attack button. Mounts on each weapon row in
// WeaponsTracker. Visible only when the character is a participant in an
// active encounter. Clicking drives the flow:
//
//   1. Open target picker
//   2. On target selected: declareAttack()
//   3. Confirm the cost callback, then rollAttackRoll() — gets hit/miss, triggers Shield offer
//   4. Stop here. DM's AttackResolutionModal picks up from attack_rolled and
//      walks through damage + apply once all reactions resolve.
//
// Kept deliberately lean — spells, AoE, and multi-target attacks come in
// v2.101+.

import { useRef, useState } from 'react';
import { useCombatSelector } from '../../context/CombatContext';
import { declareAttack, rollAttackRoll, type DeclareAttackInput } from '../../lib/pendingAttack';
import TargetPickerModal from './TargetPickerModal';
import type { CombatParticipant } from '../../types';

interface Props {
  characterId: string;
  /** Attack bonus (includes proficiency, ability mod, magic item bonuses).
   *  Only used when attackKind='attack_roll'. */
  attackBonus?: number;
  /** Damage dice expression like "1d8+3". */
  damageDice: string;
  damageType: string;
  /** Weapon or ability name shown in the log. */
  attackName: string;
  /** 'weapon' | 'spell' | 'ability' — used for attack_source classification. */
  source?: 'weapon' | 'spell' | 'ability';
  /** v2.618.0 — max range in feet for target gating (null = no gate,
   *  fail open). Weapons: weaponMaxRangeFt; spells: parseRangeToFt. */
  maxRangeFt?: number | null;
  /** v2.621.0 — normal range (weapons with an X/Y band). Passed to the
   *  picker for the long-range Disadvantage reminder (SRD 5.2.1). */
  normalRangeFt?: number | null;
  /** v2.101.0 — single-target spell variant. Defaults to 'attack_roll'. */
  attackKind?: 'attack_roll' | 'save' | 'auto_hit';
  /** Required when attackKind='save'. */
  saveDC?: number;
  saveAbility?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  saveSuccessEffect?: 'half' | 'none' | 'other';
  /** Optional compact / minimal styling override. */
  compact?: boolean;
  /** Custom button label override. */
  label?: string;
  /** Called once after declaration is confirmed, before rolling — lets parent record its cost. */
  onDeclared?: () => void;
}

export default function PlayerAttackButton({
  characterId,
  attackBonus,
  damageDice,
  damageType,
  attackName,
  source = 'weapon',
  maxRangeFt = null,
  normalRangeFt = null,
  attackKind = 'attack_roll',
  saveDC,
  saveAbility,
  saveSuccessEffect = 'half',
  compact = false,
  label,
  onDeclared,
}: Props) {
  // v2.645 slice 2: granular selectors (identity-reconciled upstream).
  const encounter = useCombatSelector(s => s.encounter);
  const participants = useCombatSelector(s => s.participants);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  // v2.855: preserve the original request and callback across ambiguous responses.
  // This is component-lifetime recovery; durable atomic spell payment is separate.
  const pending = useRef<{input: DeclareAttackInput; onDeclared?: () => void} | null>(null);

  // Find my participant row in the active encounter
  const myParticipant = participants.find(
    p => p.participant_type === 'character' && p.entity_id === characterId
  );

  // Not in combat — render nothing so WeaponsTracker's default Hit/Damage
  // buttons stay the happy path.
  if (!encounter || encounter.status !== 'active' || !myParticipant) return null;

  async function handlePick(target: CombatParticipant) {
    if (inFlight.current || pending.current || !encounter || !myParticipant) return;
    setPicking(false);
    pending.current = {onDeclared, input: {
        requestId: crypto.randomUUID(),
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
        attackKind,
        // Attack-roll specifics
        attackBonus: attackKind === 'attack_roll' ? (attackBonus ?? 0) : null,
        targetAC: attackKind === 'attack_roll' ? target.ac : null,
        // Save-based specifics
        saveDC: attackKind === 'save' ? saveDC ?? null : null,
        saveAbility: attackKind === 'save' ? saveAbility ?? null : null,
        saveSuccessEffect: attackKind === 'save' ? saveSuccessEffect : null,
        // Damage (always defined for attack pipelines)
        damageDice,
        damageType,
      }};
    await submitDeclaration();
  }

  async function submitDeclaration() {
    const request = pending.current;
    if (inFlight.current || !request) return;
    inFlight.current = true; setBusy(true); setError('');
    let confirmed = false, costRecorded = false;
    try {
      const attack = await declareAttack(request.input);
      if (!attack) {
        setError('Attack declaration not confirmed. Retry the same request before choosing another target.');
        return;
      }
      confirmed = true;
      // Clear before calling the parent: a callback failure must never replay cost.
      pending.current = null;
      request.onDeclared?.(); costRecorded = true;
      if (request.input.attackKind === 'attack_roll' && !await rollAttackRoll(attack.id)) {
        setError('Attack declared, but its roll was not confirmed. Ask the DM to finish the existing attack.');
      }
    } catch {
      setError(!confirmed
        ? 'Attack declaration not confirmed. Retry the same request before choosing another target.'
        : !costRecorded
          ? 'Attack declared, but sheet resources could not be confirmed. Review the cost and ask the DM to finish the existing attack.'
          : 'Attack declared, but its roll was not confirmed. Ask the DM to finish the existing attack.');
    } finally {
      inFlight.current = false; setBusy(false);
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
    <span style={{display:'inline-flex',flexDirection:'column',alignItems:'flex-end',gap:4,minWidth:0,maxWidth:180}}>
      <button
        onClick={() => {if (pending.current) void submitDeclaration(); else setPicking(true);}}
        disabled={busy}
        title={`Attack a target with ${attackName} — runs full combat resolution`}
        style={buttonStyle}
      >
        {busy ? '…' : pending.current ? 'Retry declaration' : (label ?? '⚔ Attack')}
      </button>
      {error && <span role="alert" style={{display:'block',fontSize:12,color:'var(--red)',overflowWrap:'anywhere'}}>{error}</span>}
      {picking && (
        <TargetPickerModal
          participants={participants}
          excludeParticipantId={myParticipant.id}
          title={`Attack with ${attackName}`}
          subtitle={`${attackKind === 'save' ? `${saveAbility ?? ''} DC ${saveDC ?? '—'} save · ` : attackKind === 'attack_roll' ? `${(attackBonus ?? 0) >= 0 ? '+' : ''}${attackBonus ?? 0} to hit · ` : ''}${damageDice} ${damageType}`}
          onPick={handlePick}
          onCancel={() => setPicking(false)}
          fromParticipant={myParticipant}
          campaignId={encounter.campaign_id}
          maxRangeFt={maxRangeFt}
          normalRangeFt={normalRangeFt}
        />
      )}
    </span>
  );
}
