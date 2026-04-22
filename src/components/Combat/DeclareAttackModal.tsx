// v2.97.0 — Phase E of the Combat Backbone
//
// DM form for declaring a new attack. Kept minimal and explicit in this first
// Phase E ship — DM types in attack name, bonus, damage dice, picks target.
// v2.98+ will auto-populate from monster action data and player weapon inventory.

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCombat } from '../../context/CombatContext';
import { declareAttack, declareMultiTargetAttack } from '../../lib/pendingAttack';
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
  // v2.104.0 — Phase F pt 3c: multi-target AoE
  const [isMulti, setIsMulti] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [attackName, setAttackName] = useState('');
  const [kind, setKind] = useState<'attack_roll' | 'save' | 'auto_hit'>('attack_roll');
  const [attackBonus, setAttackBonus] = useState<string>('0');
  const [saveDC, setSaveDC] = useState<string>('13');
  const [saveAbility, setSaveAbility] = useState('DEX');
  const [saveSuccessEffect, setSaveSuccessEffect] = useState<'half' | 'none' | 'other'>('half');
  const [damageDice, setDamageDice] = useState('1d6');
  const [damageType, setDamageType] = useState('slashing');
  // v2.103.0 — Phase F cover
  const [coverLevel, setCoverLevel] = useState<'none' | 'half' | 'three_quarters' | 'total'>('none');
  const [persistCover, setPersistCover] = useState(false);
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

  // v2.103.0 — Phase F: auto-populate cover from target's persistent_cover
  // map whenever attacker + target change. DM can still override for this
  // specific attack.
  useEffect(() => {
    if (!attacker || !target) { setCoverLevel('none'); return; }
    const persistent = target.persistent_cover ?? {};
    const fromMap = persistent[attacker.id];
    if (fromMap === 'half' || fromMap === 'three_quarters' || fromMap === 'total') {
      setCoverLevel(fromMap);
    } else {
      setCoverLevel('none');
    }
    setPersistCover(false);
  }, [attacker?.id, target?.id]);

  async function handleDeclare() {
    if (!attacker) { setError('Pick an attacker'); return; }
    if (!attackName.trim()) { setError('Enter an attack name'); return; }

    const attackerType: CombatParticipant['participant_type'] = attacker.participant_type;

    if (isMulti) {
      if (targetIds.length === 0) { setError('Pick at least one target'); return; }
      setSaving(true);
      setError('');

      const targets = targetIds
        .map(id => participants.find(p => p.id === id))
        .filter((p): p is CombatParticipant => !!p)
        .map(p => ({ participantId: p.id, name: p.name, type: p.participant_type }));

      // Multi-target only makes sense for save-based or auto-hit AoE. Fall
      // back to 'save' kind if the DM left it on attack_roll (single-target-
      // only mechanic) — preserve the dice / DC / ability they already set.
      const effectiveKind = kind === 'attack_roll' ? 'save' : kind;

      const rows = await declareMultiTargetAttack({
        campaignId,
        encounterId: encounter?.id ?? null,
        attackerParticipantId: attacker.id,
        attackerName: attacker.name,
        attackerType,
        attackSource: attackerType === 'character' ? 'spell' : 'monster_action',
        attackName: attackName.trim(),
        attackKind: effectiveKind,
        saveDC: effectiveKind === 'save' ? parseInt(saveDC, 10) || 10 : null,
        saveAbility: effectiveKind === 'save' ? saveAbility : null,
        saveSuccessEffect: effectiveKind === 'save' ? saveSuccessEffect : null,
        damageDice: damageDice.trim() || null,
        damageType: damageType.trim() || null,
        coverLevel,    // applies to every target in this batch as a blanket value
        persistCover,
        targets,
      });

      setSaving(false);
      if (rows.length === 0) {
        setError('Declare failed — check console.');
        return;
      }
      onDeclared();
      return;
    }

    // Single-target path
    if (!target) { setError('Pick a target'); return; }
    setSaving(true);
    setError('');

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
      coverLevel,
      persistCover,
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
              <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{isMulti ? `Targets (${targetIds.length})` : 'Target'}</span>
                {/* v2.104.0 — Phase F: multi-target toggle */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 9, fontWeight: 700, color: isMulti ? '#a78bfa' : 'var(--t-3)',
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  <input
                    type="checkbox"
                    checked={isMulti}
                    onChange={e => { setIsMulti(e.target.checked); setTargetIds([]); setTargetId(''); }}
                    style={{ margin: 0 }}
                  />
                  AoE
                </label>
              </div>
              {!isMulti ? (
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
              ) : (
                <div style={{
                  border: '1px solid var(--c-border)', borderRadius: 6,
                  maxHeight: 140, overflowY: 'auto',
                  padding: 4,
                }}>
                  {selectable.filter(p => p.id !== attackerId).map(p => {
                    const checked = targetIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '4px 6px', borderRadius: 4,
                          background: checked ? 'rgba(167,139,250,0.12)' : 'transparent',
                          cursor: 'pointer', fontSize: 11,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setTargetIds(prev => e.target.checked
                              ? [...prev, p.id]
                              : prev.filter(id => id !== p.id));
                          }}
                          style={{ margin: 0 }}
                        />
                        <span style={{ flex: 1 }}>
                          {p.name} <span style={{ color: 'var(--t-3)' }}>· {p.participant_type}</span>
                        </span>
                        <span style={{ color: '#60a5fa', fontSize: 10 }}>AC {p.ac ?? '?'}</span>
                        <span style={{ color: 'var(--t-3)', fontSize: 10 }}>{p.current_hp}/{p.max_hp}</span>
                      </label>
                    );
                  })}
                </div>
              )}
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

          {/* v2.103.0 — Phase F: cover selector. Auto-populates from target's
              persistent_cover map; "Save as persistent" checkbox writes the
              choice back to the target so future attacks from this attacker
              inherit it. */}
          <div>
            <div style={labelStyle}>
              Target Cover
              {target && attacker && target.persistent_cover?.[attacker.id] && (
                <span style={{ color: 'var(--t-3)', marginLeft: 8, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
                  · default from saved cover
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {([
                ['none', 'None', null, '#94a3b8'],
                ['half', 'Half', '+2 AC', '#60a5fa'],
                ['three_quarters', '¾', '+5 AC', '#a78bfa'],
                ['total', 'Total', 'auto-miss', '#f87171'],
              ] as const).map(([key, label, hint, color]) => {
                const active = coverLevel === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCoverLevel(key as any)}
                    style={{
                      flex: 1, fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                      padding: '6px 8px', borderRadius: 5,
                      border: active ? `1px solid ${color}` : '1px solid var(--c-border)',
                      background: active ? `${color}20` : 'transparent',
                      color: active ? color : 'var(--t-2)',
                      minHeight: 0, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      letterSpacing: '0.02em',
                    }}
                  >
                    <span style={{ textTransform: 'uppercase' }}>{label}</span>
                    {hint && <span style={{ fontSize: 9, opacity: 0.75, letterSpacing: 0, textTransform: 'none' }}>{hint}</span>}
                  </button>
                );
              })}
            </div>
            {coverLevel !== 'none' && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--t-2)', cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={persistCover}
                  onChange={e => setPersistCover(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Save as persistent cover (future attacks from this attacker inherit)
              </label>
            )}
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
