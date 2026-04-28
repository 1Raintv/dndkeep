// v2.115.0 — Phase H pt 6 of the Combat Backbone
//
// Opens after a player casts a registry-known concentration/buff spell
// (Bless, Hunter's Mark, Hex, Divine Favor) while an active encounter
// exists. Lets the player pick target participants; on confirm, calls
// applyBuffFromSpell which walks the registry and applies the right buff
// with source='spell:{name}' + casterParticipantId tagged for later
// concentration cleanup.
//
// Flow:
//   1. Mount with campaignId + casterCharacterId + spellName
//   2. Load active encounter + caster's participant_id + all living targets
//   3. If registry scope == 'on_caster_only', auto-apply and close
//   4. Otherwise show target tiles; user picks up to MAX_TARGETS; Apply

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { BUFF_SPELL_REGISTRY, applyBuffFromSpell } from '../../lib/buffs';

// v2.316: HP/conditions/buffs/death-save reads come from combatants via JOIN.
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from '../../lib/combatParticipantNormalize';
import { isCreatureParticipantType } from '../../lib/participantType';

interface Props {
  campaignId: string;
  casterCharacterId: string;
  spellName: string;
  onClose: () => void;
}

interface MiniParticipant {
  id: string;
  name: string;
  participant_type: 'character' | 'monster' | 'npc';
  current_hp: number;
  max_hp: number;
  is_dead: boolean;
}

export default function BuffTargetPickerModal({
  campaignId, casterCharacterId, spellName, onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [casterParticipantId, setCasterParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MiniParticipant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registryKey = spellName.trim().toLowerCase();
  const entry = BUFF_SPELL_REGISTRY[registryKey];
  // Bless targets "any number of creatures up to 3" per 2024 PHB
  const MAX_TARGETS =
    entry?.scope === 'per_target' ? 3
    : entry?.scope === 'on_caster_per_target' ? 1
    : 0;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // 1. Find the active encounter for this campaign
        const { data: enc } = await supabase
          .from('combat_encounters')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('status', 'active')
          .maybeSingle();
        if (cancelled) return;
        if (!enc) {
          // Not in combat — silently no-op (buff still takes effect on the
          // character sheet, just no participant-level application yet).
          onClose();
          return;
        }
        setEncounterId(enc.id as string);

        // 2. Resolve caster's participant row
        const { data: casterRow } = await supabase
          .from('combat_participants')
          .select('id')
          .eq('encounter_id', enc.id)
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

        // 3. For caster-only buffs, auto-apply and close
        if (entry?.scope === 'on_caster_only') {
          await applyBuffFromSpell({
            campaignId,
            encounterId: enc.id as string,
            spellName,
            casterParticipantId: casterRow.id as string,
            targetParticipantIds: [],
          });
          onClose();
          return;
        }

        // 4. Load the rest of the participants (targets to pick from)
        const { data: allRaw } = await (supabase as any)
          .from('combat_participants')
          .select('id, name, participant_type, ' + JOINED_COMBATANT_FIELDS)
          .eq('encounter_id', enc.id)
          .eq('is_dead', false)
          .order('initiative', { ascending: false });
  const all = ((allRaw ?? []) as any[]).map(normalizeParticipantRow);
        if (cancelled) return;
        const list = ((all ?? []) as MiniParticipant[]);
        setParticipants(list);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [campaignId, casterCharacterId, spellName]);   // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTarget(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_TARGETS) return prev;   // cap at MAX_TARGETS
        next.add(id);
      }
      return next;
    });
  }

  async function handleApply() {
    if (!encounterId || !casterParticipantId || selected.size === 0) return;
    setApplying(true);
    try {
      await applyBuffFromSpell({
        campaignId,
        encounterId,
        spellName,
        casterParticipantId,
        targetParticipantIds: Array.from(selected),
      });
      onClose();
    } catch (e) {
      setError(String(e));
      setApplying(false);
    }
  }

  // Render
  if (loading || entry?.scope === 'on_caster_only') {
    // Loading or auto-applying — render nothing (flash too fast to be useful)
    return null;
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 25000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '2px solid rgba(250,204,21,0.6)',
          boxShadow: '0 0 40px rgba(250,204,21,0.25), 0 10px 40px rgba(0,0,0,0.8)',
          maxWidth: 520, width: '100%',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          animation: 'modalIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(250,204,21,0.08)',
        }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#facc15' }}>
            ✦ {spellName}
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 15, fontWeight: 800, color: 'var(--t-1)', marginTop: 2 }}>
            Choose {MAX_TARGETS === 1 ? 'a target' : `up to ${MAX_TARGETS} targets`}
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>
            Selected: {selected.size} / {MAX_TARGETS}
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 20px', color: '#f87171', fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* Target list */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: 10,
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
        }}>
          {participants.map(p => {
            const isSelected = selected.has(p.id);
            // v2.350.0: 'monster'/'npc' merged into 'creature'.
            // Helper recognizes all three for in-flight data.
            const typeColor =
              p.participant_type === 'character' ? '#60a5fa'
              : isCreatureParticipantType(p.participant_type) ? '#f87171'
              : '#a78bfa';
            return (
              <button
                key={p.id}
                onClick={() => toggleTarget(p.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '8px 10px', borderRadius: 6,
                  border: isSelected
                    ? '2px solid #facc15'
                    : '1px solid var(--c-border)',
                  background: isSelected
                    ? 'rgba(250,204,21,0.15)'
                    : '#0d1117',
                  cursor: 'pointer', minHeight: 0, textAlign: 'left',
                  gap: 2,
                }}
              >
                <span style={{
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
                  color: isSelected ? '#facc15' : typeColor,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {p.name}
                </span>
                <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 10, color: 'var(--t-3)' }}>
                  {p.current_hp}/{p.max_hp} HP · {p.participant_type}
                </span>
              </button>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={onClose}
            disabled={applying}
            style={{
              flex: 1,
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              padding: '9px 14px', borderRadius: 6,
              border: '1px solid var(--c-border)',
              background: 'transparent', color: 'var(--t-2)',
              cursor: 'pointer', minHeight: 0,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleApply}
            disabled={applying || selected.size === 0}
            className="btn-gold"
            style={{
              flex: 2,
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 900,
              padding: '9px 14px', borderRadius: 6,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              opacity: selected.size === 0 ? 0.5 : 1,
            }}
          >
            ✦ Apply {spellName}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
