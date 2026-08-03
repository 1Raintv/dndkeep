// v2.635.0 — Aura cast modal.
//
// Opens after a player casts a registry-known aura spell (currently
// Spirit Guardians) while an active encounter exists. Mirrors
// BuffTargetPickerModal's shape: resolve the active encounter, resolve
// the caster's participant row, list living participants, confirm.
//
// Two RAW choices are surfaced here rather than guessed:
//
//   1. Designation — "When you cast this spell, you can designate
//      creatures to be unaffected by it." Selected creatures go into
//      the AuraSpec's exemptParticipantIds and are skipped by every
//      trigger and by the Speed effect. This is a CAST-TIME choice per
//      RAW: it can't be changed later without recasting.
//
//   2. Damage type — Spirit Guardians deals Radiant if the caster is
//      good or neutral and Necrotic if evil. The app doesn't model
//      alignment, so the player picks instead of the engine assuming.
//
// Out of combat (no active encounter) this silently closes: the spell
// still lands on the character sheet and the DM narrates. The aura
// engine is positional and has nothing to attach to without an
// encounter and a map.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { AURA_SPELLS, startAura } from '../../lib/auras';
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from '../../lib/combatParticipantNormalize';

interface Props {
  campaignId: string;
  casterCharacterId: string;
  /** spells.ts id — must be a key of AURA_SPELLS. */
  spellId: string;
  saveDC: number;
  /** Slot the spell was cast at; drives damage scaling. */
  slotLevel: number;
  onClose: () => void;
}

interface MiniParticipant {
  id: string;
  name: string;
  participant_type: string;
  is_dead: boolean;
}

const ACCENT = '#c084fc';

export default function AuraCastModal({
  campaignId, casterCharacterId, spellId, saveDC, slotLevel, onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [casterParticipantId, setCasterParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MiniParticipant[]>([]);
  const [exempt, setExempt] = useState<Set<string>>(new Set());
  const [damageType, setDamageType] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entry = AURA_SPELLS[spellId];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (!entry) { onClose(); return; }
        setDamageType(entry.damageTypeChoices[0] ?? '');

        const { data: enc } = await supabase
          .from('combat_encounters')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('status', 'active')
          .maybeSingle();
        if (cancelled) return;
        if (!enc) { onClose(); return; }   // out of combat — nothing to attach to
        setEncounterId(enc.id as string);

        const { data: casterRow } = await supabase
          .from('combat_participants')
          .select('id')
          .eq('encounter_id', enc.id as string)
          .eq('participant_type', 'character')
          .eq('entity_id', casterCharacterId)
          .maybeSingle();
        if (cancelled) return;
        if (!casterRow) {
          setError('Caster is not a combat participant in this encounter.');
          setLoading(false);
          return;
        }
        setCasterParticipantId(casterRow.id as string);

        const { data: rowsRaw } = await (supabase as any)
          .from('combat_participants')
          .select('id, name, participant_type, ' + JOINED_COMBATANT_FIELDS)
          .eq('encounter_id', enc.id as string);
        if (cancelled) return;
        const rows = ((rowsRaw ?? []) as any[])
          .map(normalizeParticipantRow)
          .filter((r: any) => !r.is_dead && r.id !== casterRow.id)
          .map((r: any) => ({
            id: r.id as string,
            name: r.name as string,
            participant_type: r.participant_type as string,
            is_dead: !!r.is_dead,
          }));
        setParticipants(rows);
        setLoading(false);
      } catch {
        if (!cancelled) { setError('Could not load the encounter.'); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, casterCharacterId, spellId]);

  function toggle(id: string) {
    setExempt(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function onActivate() {
    if (!entry || !encounterId || !casterParticipantId || applying) return;
    setApplying(true);
    try {
      const spec = entry.build({
        saveDC,
        slotLevel,
        damageType,
        exemptParticipantIds: Array.from(exempt),
      });
      await startAura({
        campaignId,
        encounterId,
        originParticipantId: casterParticipantId,
        spec,
      });
      onClose();
    } catch {
      setError('Could not activate the aura.');
      setApplying(false);
    }
  }

  if (loading || !entry) return null;

  const spec = entry.build({
    saveDC, slotLevel, damageType, exemptParticipantIds: Array.from(exempt),
  });

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 30000, padding: 20,
    }}>
      <div style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${ACCENT}`,
        maxWidth: 460, width: '100%', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 40px ${ACCENT}55, 0 10px 40px rgba(0,0,0,0.8)`,
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: `${ACCENT}15`,
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: ACCENT,
          }}>
            ✦ Emanation
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--t-1)', marginTop: 2,
          }}>
            {entry.label}
          </div>
        </div>

        <div style={{
          padding: '16px 20px', display: 'flex', flexDirection: 'column',
          gap: 12, overflowY: 'auto',
        }}>
          {error && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)',
              fontFamily: 'var(--ff-body)', fontSize: 12, color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <div style={{
            padding: 10, borderRadius: 8,
            background: '#0d1117', border: '1px solid var(--c-border)',
            fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5,
          }}>
            {spec.radiusFt}-ft Emanation centred on you, moving with you.
            Creatures make a {spec.saveAbility} save (DC {spec.saveDC}) when they enter it,
            when it sweeps over them, and when they end their turn inside —
            once per turn. {spec.damageDice} {spec.damageType} on a failure,
            half on a success. Speed halved inside.
          </div>

          {entry.damageTypeChoices.length > 1 && (
            <div>
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--t-2)', marginBottom: 6,
              }}>
                Damage type — Radiant if good or neutral, Necrotic if evil
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {entry.damageTypeChoices.map(dt => (
                  <button
                    key={dt}
                    onClick={() => setDamageType(dt)}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${damageType === dt ? ACCENT : 'var(--c-border)'}`,
                      background: damageType === dt ? `${ACCENT}22` : 'transparent',
                      color: damageType === dt ? 'var(--t-1)' : 'var(--t-2)',
                      fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                      textTransform: 'capitalize', cursor: 'pointer',
                    }}
                  >
                    {dt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entry.allowsDesignation && (
            <div>
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--t-2)', marginBottom: 6,
              }}>
                Designate unaffected ({exempt.size} chosen) — cast-time only
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {participants.length === 0 && (
                  <div style={{
                    fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)',
                  }}>
                    No other creatures in this encounter.
                  </div>
                )}
                {participants.map(p => {
                  const on = exempt.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px', borderRadius: 6,
                        border: `1px solid ${on ? ACCENT : 'var(--c-border)'}`,
                        background: on ? `${ACCENT}18` : 'transparent',
                        color: on ? 'var(--t-1)' : 'var(--t-2)',
                        fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{ fontSize: 10, color: on ? ACCENT : 'var(--t-3)' }}>
                        {on ? 'UNAFFECTED' : p.participant_type === 'character' ? 'ally' : 'creature'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={onClose}
            disabled={applying}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--c-border)', background: 'transparent',
              color: 'var(--t-2)', fontFamily: 'var(--ff-body)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <button
            onClick={onActivate}
            disabled={applying || !casterParticipantId}
            style={{
              flex: 2, padding: '9px 12px', borderRadius: 8,
              border: `1px solid ${ACCENT}`, background: `${ACCENT}22`,
              color: 'var(--t-1)', fontFamily: 'var(--ff-body)',
              fontSize: 12, fontWeight: 800,
              cursor: applying ? 'default' : 'pointer',
              opacity: applying ? 0.6 : 1,
            }}
          >
            {applying ? 'Activating…' : 'Activate Emanation'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
