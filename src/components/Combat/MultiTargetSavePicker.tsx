// v2.745 — extracted from MonsterActionPanel so movement/range guards can be tested directly.
// Keep selected targets visible for correction when live movement invalidates their range.
import {useMemo,useState} from 'react';
import type {CombatParticipant} from '../../types';
import type {MonsterAction} from './MonsterActionPanel';
import {distanceBetweenParticipantsFtUsingMap,type ActiveBattleMap,type ParticipantForTokenLookup} from '../../lib/battleMapGeometry';
import {useMapMovementBusy,isMapMovementBusy} from '../Campaign/battlemap/useMapMovementBusy';
import {MovementPendingNotice} from './MovementPendingNotice';

interface MultiPickerProps {
  attackerParticipant: CombatParticipant;
  participants: CombatParticipant[];
  action: MonsterAction;
  rangeFt: number;
  liveBattleMap: ActiveBattleMap | null;
  onConfirm: (targets: CombatParticipant[]) => void;
  onCancel: () => void;
}

export function MultiTargetSavePicker(props: MultiPickerProps) {
  const { attackerParticipant, participants, action, rangeFt, liveBattleMap, onConfirm, onCancel } = props;
  const movementBusy=useMapMovementBusy();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { targets, excluded } = useMemo(() => {
    const attackerLookup: ParticipantForTokenLookup = {
      id: attackerParticipant.id,
      name: attackerParticipant.name,
      participant_type: attackerParticipant.participant_type,
      entity_id: attackerParticipant.entity_id, combatant_id: attackerParticipant.combatant_id,
    };
    const valid: Array<{ participant: CombatParticipant; distFt: number | null; inRange: boolean }> = [];
    const excl: Array<{ participant: CombatParticipant; reason: 'self' | 'dead' }> = [];

    for (const p of participants) {
      if (p.id === attackerParticipant.id) {
        excl.push({ participant: p, reason: 'self' });
        continue;
      }
      if (p.is_dead) {
        excl.push({ participant: p, reason: 'dead' });
        continue;
      }
      const lookup: ParticipantForTokenLookup = {
        id: p.id,
        name: p.name,
        participant_type: p.participant_type,
        entity_id: p.entity_id, combatant_id: p.combatant_id,
      };
      const dist = liveBattleMap
        ? distanceBetweenParticipantsFtUsingMap(attackerLookup, lookup, liveBattleMap)
        : null;
      const inRange = dist === null ? true : dist <= rangeFt;
      valid.push({ participant: p, distFt: dist, inRange });
    }

    valid.sort((a, b) => {
      const aIsPC = a.participant.participant_type === 'character' ? 0 : 1;
      const bIsPC = b.participant.participant_type === 'character' ? 0 : 1;
      if (aIsPC !== bIsPC) return aIsPC - bIsPC;
      return a.participant.name.localeCompare(b.participant.name);
    });

    return { targets: valid, excluded: excl };
  }, [attackerParticipant, participants, liveBattleMap, rangeFt]);

  const inRangeIds = useMemo(
    () => new Set(targets.filter(t => t.inRange).map(t => t.participant.id)),
    [targets],
  );

  const invalidSelection=[...selected].some(id=>!inRangeIds.has(id));
  const cannotConfirm=movementBusy || selected.size===0 || invalidSelection;

  function toggle(id: string) {
    if(isMapMovementBusy())return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInRange() {
    if(isMapMovementBusy())return;
    setSelected(new Set(inRangeIds));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function confirm() {
    // v2.745 — retain choices but never submit a stale range selection.
    if(isMapMovementBusy() || cannotConfirm)return;
    const out: CombatParticipant[] = [];
    const byId = new Map(participants.map(p => [p.id, p]));
    for (const id of selected) {
      const p = byId.get(id);
      if (p) out.push(p);
    }
    onConfirm(out);
  }

  const ability = action.dc_type ?? '?';
  const dc = action.dc_value ?? '?';
  const damageHint = action.damage_dice
    ? ` · ${action.damage_dice} ${action.damage_type ?? ''}`
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(460px, 96vw)',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md, 8px)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
          fontFamily: 'var(--ff-body)',
          color: 'var(--t-1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Pick targets — within {rangeFt} ft
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: '#c4b5fd' }}>
            ✧ {action.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-2)', marginTop: 2 }}>
            DC {dc} {ability} save{damageHint}
          </div>
          {action.desc && (
            <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
              {action.desc}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={selectAllInRange}
              disabled={movementBusy || inRangeIds.size === 0}
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '4px 8px', borderRadius: 4,
                background: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.4)',
                color: '#c4b5fd',
                cursor: inRangeIds.size === 0 ? 'not-allowed' : 'pointer',
                opacity: inRangeIds.size === 0 ? 0.4 : 1,
              }}
            >
              Select all in range ({inRangeIds.size})
            </button>
            <button
              onClick={clearAll}
              disabled={selected.size === 0}
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '4px 8px', borderRadius: 4,
                background: 'transparent',
                border: '1px solid var(--c-border)',
                color: 'var(--t-2)',
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.4 : 1,
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <MovementPendingNotice busy={movementBusy}/>
        {invalidSelection && !movementBusy && <div role="alert" style={{padding:'10px 14px',fontSize:13,color:'#f3d595'}}>A selected target is no longer available or in range. Deselect it or clear the selection before saving.</div>}
        <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {targets.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
              No participants in this encounter.
            </div>
          )}
          {targets.map(({ participant: p, distFt, inRange }) => {
            const isPC = p.participant_type === 'character';
            const hpPct = p.max_hp && p.max_hp > 0 ? (p.current_hp ?? 0) / p.max_hp : 1;
            const hpColor = hpPct >= 0.66 ? '#34d399' : hpPct >= 0.33 ? '#fbbf24' : '#f87171';
            const distLabel = distFt === null ? '(no map)' : `${Math.round(distFt)} ft`;
            const isSelected = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => (inRange || isSelected) && toggle(p.id)}
                disabled={movementBusy || (!inRange && !isSelected)}
                title={inRange
                  ? `${p.name} · ${distLabel}${p.ac ? ` · AC ${p.ac}` : ''}`
                  : `${p.name} is out of range (${distLabel}; ${rangeFt} ft max)`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 6,
                  background: !inRange
                    ? 'rgba(255,255,255,0.02)'
                    : isSelected
                      ? 'rgba(167,139,250,0.20)'
                      : (isPC ? 'rgba(234,179,8,0.06)' : 'rgba(248,113,113,0.05)'),
                  border: '1px solid ' + (
                    !inRange
                      ? 'rgba(255,255,255,0.05)'
                      : isSelected
                        ? 'rgba(167,139,250,0.7)'
                        : 'var(--c-border)'
                  ),
                  cursor: inRange ? 'pointer' : 'not-allowed',
                  opacity: inRange ? 1 : 0.45,
                  textAlign: 'left',
                  color: 'var(--t-1)',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 3,
                  border: '1.5px solid ' + (isSelected ? '#c4b5fd' : 'var(--c-border)'),
                  background: isSelected ? '#c4b5fd' : 'transparent',
                  color: isSelected ? '#1a1a1a' : 'transparent',
                  fontSize: 12, fontWeight: 900, lineHeight: 1,
                  flexShrink: 0,
                }}>
                  ✓
                </span>
                <span
                  style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: isPC ? 'var(--c-gold-l)' : '#f87171',
                    minWidth: 32,
                  }}
                >
                  {isPC ? 'PC' : 'CRE'}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--t-3)', marginLeft: 8 }}>
                    {distLabel}{p.ac ? ` · AC ${p.ac}` : ''}
                  </span>
                </span>
                {p.max_hp ? (
                  <span style={{ fontSize: 10, color: hpColor, fontWeight: 700, minWidth: 64, textAlign: 'right' }}>
                    {p.current_hp ?? 0}/{p.max_hp}
                  </span>
                ) : null}
                {!inRange && (
                  <span style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic' }}>
                    out of range
                  </span>
                )}
              </button>
            );
          })}
          {excluded.length > 0 && (
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--t-3)', textAlign: 'center', padding: '8px 0 2px',
            }}>
              Excluded — {excluded.length}
            </div>
          )}
          {excluded.map(({ participant: p, reason }) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                opacity: 0.5,
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, textDecoration: reason === 'dead' ? 'line-through' : 'none' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {reason}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--t-2)' }}>
            {selected.size} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid var(--c-border)',
                borderRadius: 4,
                color: 'var(--t-2)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={cannotConfirm}
              style={{
                padding: '6px 14px',
                background: cannotConfirm ? 'rgba(167,139,250,0.10)' : 'rgba(167,139,250,0.30)',
                border: '1px solid rgba(167,139,250,0.6)',
                borderRadius: 4,
                color: cannotConfirm ? 'var(--t-3)' : '#c4b5fd',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: cannotConfirm ? 'not-allowed' : 'pointer',
                opacity: cannotConfirm ? 0.5 : 1,
              }}
            >
              Save {selected.size > 0 ? `${selected.size} target${selected.size === 1 ? '' : 's'}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
