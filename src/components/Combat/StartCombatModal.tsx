// v2.96.0 — Phase D of the Combat Backbone
//
// Start Combat modal. DM picks which participants enter combat (campaign
// characters + monsters from a picker), chooses initiative mode, then clicks
// Start Combat to create the encounter.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useMonsters } from '../../lib/hooks/useMonsters';
import { abilityModifier } from '../../lib/gameUtils';
import { formatCR } from '../../lib/monsterUtils';
import {
  startEncounter,
  characterToSeed,
  monsterToSeed,
  type SeedSource,
} from '../../lib/combatEncounter';
import type { Character, MonsterData } from '../../types';

interface Props {
  campaignId: string;
  onClose: () => void;
  onStarted: () => void;
}

interface MonsterInstance {
  id: string;             // local instance id
  monsterId: string;
  name: string;
  hidden: boolean;
}

export default function StartCombatModal({ campaignId, onClose, onStarted }: Props) {
  const { monsters: allMonsters } = useMonsters();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [includedCharIds, setIncludedCharIds] = useState<Set<string>>(new Set());
  const [instances, setInstances] = useState<MonsterInstance[]>([]);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [encounterName, setEncounterName] = useState('Encounter');
  const [initiativeMode, setInitiativeMode] = useState<'auto_all' | 'player_agency'>('auto_all');
  const [hiddenRevealMode, setHiddenRevealMode] = useState<'roll_at_reveal' | 'roll_at_start'>('roll_at_reveal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load characters assigned to this campaign
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('characters')
        .select('*')
        .eq('campaign_id', campaignId);
      const chars = (data ?? []) as Character[];
      setCharacters(chars);
      setIncludedCharIds(new Set(chars.map(c => c.id)));
    })();
  }, [campaignId]);

  function toggleChar(id: string) {
    setIncludedCharIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addMonsterInstance(m: MonsterData) {
    // Count existing instances of this monster to append #N suffix
    const existing = instances.filter(i => i.monsterId === m.id).length;
    const label = existing > 0 ? `${m.name} ${existing + 1}` : m.name;
    setInstances(prev => [
      ...prev,
      {
        id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        monsterId: m.id,
        name: label,
        hidden: false,
      },
    ]);
  }

  function removeInstance(id: string) {
    setInstances(prev => prev.filter(i => i.id !== id));
  }

  function toggleInstanceHidden(id: string) {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, hidden: !i.hidden } : i));
  }

  function renameInstance(id: string, newName: string) {
    setInstances(prev => prev.map(i => i.id === id ? { ...i, name: newName } : i));
  }

  const filteredMonsters = monsterSearch.trim().length >= 2
    ? allMonsters
        .filter(m => m.name.toLowerCase().includes(monsterSearch.toLowerCase()))
        .slice(0, 20)
    : [];

  const totalParticipants = includedCharIds.size + instances.length;

  async function handleStart() {
    if (totalParticipants === 0) {
      setError('Add at least one character or monster.');
      return;
    }
    setSaving(true);
    setError('');

    const seeds: SeedSource[] = [];

    // Characters
    for (const c of characters) {
      if (!includedCharIds.has(c.id)) continue;
      seeds.push(characterToSeed(c));
    }

    // Monsters — resolve to full MonsterData, then seed
    for (const inst of instances) {
      const m = allMonsters.find(x => x.id === inst.monsterId);
      if (!m) continue;
      const seed = monsterToSeed(m, inst.hidden);
      seed.entityId = inst.id;    // use instance id so duplicate monster copies don't collide
      seed.name = inst.name;
      seeds.push(seed);
    }

    const result = await startEncounter({
      campaignId,
      name: encounterName.trim() || 'Encounter',
      initiativeMode,
      hiddenMonsterRevealMode: hiddenRevealMode,
      seeds,
    });

    setSaving(false);
    if (!result) {
      setError('Could not start encounter. Check your permissions.');
      return;
    }
    onStarted();
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 20000, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '1px solid var(--c-gold-bdr)',
          maxWidth: 720, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(139,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--ff-body)', letterSpacing: '0.04em' }}>⚔ Start Combat</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--t-2)' }}>
              Pick participants, choose initiative mode, then roll for glory.
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: 11, padding: '4px 10px', minHeight: 0 }}>✕</button>
        </div>

        {/* Body (scroll) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Name */}
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 4 }}>
              Encounter Name
            </div>
            <input
              value={encounterName}
              onChange={e => setEncounterName(e.target.value)}
              style={{ width: '100%', fontFamily: 'var(--ff-body)', fontSize: 13, minHeight: 0 }}
              placeholder="Goblin Ambush"
            />
          </div>

          {/* Characters */}
          <section>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 8 }}>
              Party ({includedCharIds.size}/{characters.length})
            </div>
            {characters.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
                No characters assigned to this campaign yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {characters.map(c => {
                  const on = includedCharIds.has(c.id);
                  return (
                    <label key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 10px', borderRadius: 6,
                      background: on ? 'rgba(201,146,42,0.08)' : 'transparent',
                      border: on ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                      cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggleChar(c.id)} />
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700, flex: 1 }}>
                        {c.name}
                      </span>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
                        Lv {c.level} {c.class_name} · HP {c.current_hp}/{c.max_hp} · AC {c.armor_class} · DEX mod {abilityModifier(c.dexterity ?? 10) >= 0 ? '+' : ''}{abilityModifier(c.dexterity ?? 10)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Monsters */}
          <section>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 8 }}>
              Enemies ({instances.length})
            </div>

            <input
              value={monsterSearch}
              onChange={e => setMonsterSearch(e.target.value)}
              placeholder="Type 2+ characters to search monsters..."
              style={{ width: '100%', fontFamily: 'var(--ff-body)', fontSize: 13, minHeight: 0, marginBottom: 6 }}
            />

            {filteredMonsters.length > 0 && (
              <div style={{
                border: '1px solid var(--c-border)', borderRadius: 6,
                maxHeight: 180, overflowY: 'auto',
                background: '#080d14', marginBottom: 8,
              }}>
                {filteredMonsters.map(m => (
                  <button
                    key={m.id}
                    onClick={() => addMonsterInstance(m)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', border: 'none',
                      borderBottom: '1px solid var(--c-border)',
                      background: 'transparent', textAlign: 'left', cursor: 'pointer', minHeight: 0,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700, color: 'var(--t-1)' }}>
                      {m.name}
                    </span>
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)' }}>
                      CR {formatCR(m.cr)} · AC {m.ac} · {m.hp} HP
                    </span>
                  </button>
                ))}
              </div>
            )}

            {instances.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
                No enemies added yet. Search above to add monsters. You can add the same monster multiple times to spawn a group.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {instances.map(inst => (
                  <div key={inst.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 6,
                    border: '1px solid var(--c-border)', background: '#080d14',
                  }}>
                    <input
                      value={inst.name}
                      onChange={e => renameInstance(inst.id, e.target.value)}
                      style={{ flex: 1, fontFamily: 'var(--ff-body)', fontSize: 12, minHeight: 0 }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--t-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={inst.hidden} onChange={() => toggleInstanceHidden(inst.id)} />
                      Hidden
                    </label>
                    <button
                      onClick={() => removeInstance(inst.id)}
                      style={{ fontSize: 10, padding: '3px 8px', minHeight: 0, color: '#f87171' }}
                    >Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Mode settings */}
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 4 }}>
                Initiative Mode
              </div>
              <select
                value={initiativeMode}
                onChange={e => setInitiativeMode(e.target.value as any)}
                style={{ width: '100%', fontFamily: 'var(--ff-body)', fontSize: 12, minHeight: 0 }}
              >
                <option value="auto_all">Auto — roll everyone at once</option>
                <option value="player_agency">Player agency — players roll themselves</option>
              </select>
              <p style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 4, lineHeight: 1.4 }}>
                {initiativeMode === 'auto_all'
                  ? 'Fast — app rolls initiative for every character and monster.'
                  : 'Players tap "Roll Initiative" on their own sheet. Monsters still auto-roll.'}
              </p>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 4 }}>
                Hidden Monster Initiative
              </div>
              <select
                value={hiddenRevealMode}
                onChange={e => setHiddenRevealMode(e.target.value as any)}
                style={{ width: '100%', fontFamily: 'var(--ff-body)', fontSize: 12, minHeight: 0 }}
              >
                <option value="roll_at_reveal">Roll when revealed</option>
                <option value="roll_at_start">Roll at encounter start</option>
              </select>
              <p style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 4, lineHeight: 1.4 }}>
                Affects only monsters marked Hidden. "Roll when revealed" keeps them invisible to players until you unhide them.
              </p>
            </div>
          </section>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)',
              color: '#f87171', fontSize: 12,
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
            {totalParticipants} participant{totalParticipants !== 1 ? 's' : ''} ready
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ fontFamily: 'var(--ff-body)', fontSize: 12, padding: '6px 14px' }}>Cancel</button>
            <button
              className="btn-gold"
              onClick={handleStart}
              disabled={saving || totalParticipants === 0}
              style={{ fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 800, padding: '6px 18px' }}
            >
              {saving ? 'Starting…' : '⚔ Start Combat'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
