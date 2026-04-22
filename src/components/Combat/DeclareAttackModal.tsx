// v2.97.0 — Phase E of the Combat Backbone
//
// DM form for declaring a new attack. Kept minimal and explicit in this first
// Phase E ship — DM types in attack name, bonus, damage dice, picks target.
// v2.98+ will auto-populate from monster action data and player weapon inventory.

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCombat } from '../../context/CombatContext';
import { declareAttack } from '../../lib/pendingAttack';
import type { CombatParticipant } from '../../types';

interface Props {
  campaignId: string;
  onClose: () => void;
  onDeclared: () => void;
}

const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export default function DeclareAttackModal({ campaignId, onClose, onDeclared }: Props) {
  const { encounter, participants, currentActor } = useCombat();

  // Attacker defaults to current actor
  const [attackerId, setAttackerId] = useState<string>(currentActor?.id ?? '');
  const [targetId, setTargetId] = useState<string>('');
  const [attackName, setAttackName] = useState('');
  const [kind, setKind] = useState<'attack_roll' | 'save' | 'auto_hit'>('attack_roll');
  const [attackBonus, setAttackBonus] = useState<string>('0');
  const [saveDC, setSaveDC] = useState<string>('13');
  const [saveAbility, setSaveAbility] = useState('DEX');
  const [saveSuccessEffect, setSaveSuccessEffect] = useState<'half' | 'none' | 'other'>('half');
  const [damageDice, setDamageDice] = useState('1d6');
  const [damageType, setDamageType] = useState('slashing');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const attacker = useMemo(
    () => participants.find(p => p.id === attackerId) ?? null,
    [participants, attackerId]
  );
  const target = useMemo(
    () => participants.find(p => p.id === targetId) ?? null,
    [participants, targetId]
  );

  async function handleDeclare() {
    if (!attacker) { setError('Pick an attacker'); return; }
    if (!target)   { setError('Pick a target'); return; }
    if (!attackName.trim()) { setError('Enter an attack name'); return; }

    setSaving(true);
    setError('');

    const attackerType: CombatParticipant['participant_type'] = attacker.participant_type;

    const result = await declareAttack({
      campaignId,
      encounterId: encounter?.id ?? null,
      attackerParticipantId: attacker.id,
      attackerName: attacker.name,
      attackerType,
      targetParticipantId: target.id,
      targetName: target.name,
      targetType: target.participant_type,
      attackSource: attackerType === 'character' ? 'weapon' : 'monster_action',
      attackName: attackName.trim(),
      attackKind: kind,
      attackBonus: kind === 'attack_roll' ? parseInt(attackBonus, 10) || 0 : null,
      targetAC: kind === 'attack_roll' ? target.ac : null,
      saveDC: kind === 'save' ? parseInt(saveDC, 10) || 10 : null,
      saveAbility: kind === 'save' ? saveAbility : null,
      saveSuccessEffect: kind === 'save' ? saveSuccessEffect : null,
      damageDice: damageDice.trim() || null,
      damageType: damageType.trim() || null,
    });

    setSaving(false);
    if (!result) {
      setError('Declare failed — check console.');
      return;
    }
    onDeclared();
  }

  const fieldStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 13, minHeight: 0,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--t-3)', marginBottom: 4,
  };

  // Visible targets only: drop dead participants + hidden (DM sees all anyway
  // because RLS passes them through)
  const selectable = participants.filter(p => !p.is_dead);

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 20001, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '1px solid var(--c-gold-bdr)',
          maxWidth: 560, width: '100%',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          maxHeight: '90vh',
        }}
      >
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(139,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ margin: 0 }}>⚔ Declare Attack</h3>
          <button onClick={onClose} style={{ fontSize: 11, padding: '4px 10px', minHeight: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Attacker</div>
              <select
                value={attackerId}
                onChange={e => setAttackerId(e.target.value)}
                style={{ ...fieldStyle, width: '100%' }}
              >
                <option value="">— Pick —</option>
                {selectable.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.participant_type})</option>
                ))}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Target</div>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                style={{ ...fieldStyle, width: '100%' }}
              >
                <option value="">— Pick —</option>
                {selectable.filter(p => p.id !== attackerId).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} · AC {p.ac ?? '?'} · {p.current_hp}/{p.max_hp} HP
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={labelStyle}>Attack Name</div>
            <input
              value={attackName}
              onChange={e => setAttackName(e.target.value)}
              placeholder="Bite / Longsword / Fire Bolt"
              style={{ ...fieldStyle, width: '100%' }}
            />
          </div>

          <div>
            <div style={labelStyle}>Attack Kind</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['attack_roll', 'save', 'auto_hit'] as const).map(k => {
                const active = kind === k;
                const label = k === 'attack_roll' ? 'Attack Roll' : k === 'save' ? 'Saving Throw' : 'Auto-hit';
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    style={{
                      flex: 1, fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                      padding: '6px 10px', borderRadius: 5,
                      border: active ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                      background: active ? 'var(--c-gold-bg)' : 'transparent',
                      color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
                      minHeight: 0, cursor: 'pointer',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </div>

          {kind === 'attack_roll' && (
            <div>
              <div style={labelStyle}>Attack Bonus</div>
              <input
                type="number"
                value={attackBonus}
                onChange={e => setAttackBonus(e.target.value)}
                style={{ ...fieldStyle, width: 100 }}
                placeholder="+5"
              />
              {target && (
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', marginLeft: 10 }}>
                  vs. AC {target.ac ?? '?'}
                </span>
              )}
            </div>
          )}

          {kind === 'save' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <div style={labelStyle}>Save DC</div>
                <input type="number" value={saveDC} onChange={e => setSaveDC(e.target.value)} style={{ ...fieldStyle, width: '100%' }} />
              </div>
              <div>
                <div style={labelStyle}>Ability</div>
                <select value={saveAbility} onChange={e => setSaveAbility(e.target.value)} style={{ ...fieldStyle, width: '100%' }}>
                  {SAVE_ABILITIES.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>On Success</div>
                <select value={saveSuccessEffect} onChange={e => setSaveSuccessEffect(e.target.value as any)} style={{ ...fieldStyle, width: '100%' }}>
                  <option value="half">Half damage</option>
                  <option value="none">No damage</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Damage Dice</div>
              <input value={damageDice} onChange={e => setDamageDice(e.target.value)} placeholder="1d8+3" style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <div>
              <div style={labelStyle}>Damage Type</div>
              <input value={damageType} onChange={e => setDamageType(e.target.value)} placeholder="slashing / fire / ..." style={{ ...fieldStyle, width: '100%' }} />
            </div>
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)',
              color: '#f87171', fontSize: 12,
            }}>{error}</div>
          )}
        </div>

        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--ff-body)', fontSize: 12, padding: '6px 14px' }}>Cancel</button>
          <button
            className="btn-gold"
            onClick={handleDeclare}
            disabled={saving}
            style={{ fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 800, padding: '6px 18px' }}
          >
            {saving ? 'Declaring…' : 'Declare Attack'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
