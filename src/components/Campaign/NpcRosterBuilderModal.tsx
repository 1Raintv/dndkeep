// v2.252.0 — Phase Q.6: NPC roster builder modal for v2 BattleMap.
//
// Until now, the only way to add or edit roster entries was to flip
// the BattleMap toggle to v1, use the inline NPCRoster panel there,
// then flip back to v2 to actually run combat. This modal lifts that
// editor into v2 directly.
//
// Two views:
//   - List: roster entries with a +New, Edit, Delete control set, plus
//     a search filter. Modeled on NpcRosterPickerModal's visual style.
//   - Edit form: same fields as v1's NPCEditForm (name, type, CR,
//     HP/AC/speed, 6 ability scores, basic attack, XP, description,
//     traits, immunities, color). The color picker uses the same
//     palette as v1; the emoji grid in v1 was wiped to empty strings
//     by an old encoding loss, so we just skip it here — color is
//     enough visual differentiation for the picker downstream.
//
// Future: a "Clone from SRD" button to seed a roster entry from the
// monsters table (mirrors v1's "Clone → Mine") — out of scope for
// this ship.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as rosterApi from '../../lib/api/npcRoster';
import * as srdApi from '../../lib/api/srdMonsters';
import type { RosterEntry, RosterEntryDraft } from '../../lib/api/npcRoster';
import type { SrdMonsterRow } from '../../lib/api/srdMonsters';

interface Props {
  ownerId: string;
  campaignId: string;
  onClose: () => void;
}

const TOKEN_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
  '#14b8a6', '#f59e0b', '#64748b', '#ffffff',
];

// Empty draft shape used when the DM clicks "+ New" — sensible defaults
// for a generic CR-1 humanoid. The form is permissive (any field can
// be edited) so this just primes the inputs.
const EMPTY_DRAFT: RosterEntryDraft = {
  name: '',
  type: 'Humanoid',
  cr: '1',
  size: 'Medium',
  hp: 10,
  max_hp: 10,
  ac: 12,
  speed: 30,
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  attack_name: 'Strike',
  attack_bonus: 3,
  attack_damage: '1d6',
  xp: 100,
  description: '',
  traits: '',
  immunities: '',
  image_url: null,
  emoji: '',
  color: '#ef4444',
  source_monster_id: null,
  save_proficiencies: [],
};

export default function NpcRosterBuilderModal({ ownerId, campaignId, onClose }: Props) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ entry: RosterEntry | null; draft: RosterEntryDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  // v2.254.0 — SRD picker view. When non-null, renders the picker
  // instead of the list. Selecting a monster transitions to the edit
  // form (entry: null, draft: derived from the monster). Cancel
  // returns to the list.
  const [srdMonsters, setSrdMonsters] = useState<SrdMonsterRow[] | null>(null);
  const [showSrdPicker, setShowSrdPicker] = useState(false);

  // Load on open. Re-load after every save/delete so the list stays
  // consistent without us reaching into the API helpers.
  async function reload() {
    const rows = await rosterApi.listRoster(ownerId);
    setRoster(rows);
  }
  useEffect(() => {
    let cancelled = false;
    rosterApi.listRoster(ownerId).then(rows => {
      if (cancelled) return;
      setRoster(rows);
    });
    return () => { cancelled = true; };
  }, [ownerId]);

  // v2.254.0 — lazy-load the SRD catalog on first picker-open. 334
  // rows ~once per session is fine; we keep it in component state so
  // a back-and-forth between list and picker doesn't re-hit the DB.
  useEffect(() => {
    if (!showSrdPicker || srdMonsters !== null) return;
    let cancelled = false;
    srdApi.listSrdMonsters().then(rows => {
      if (cancelled) return;
      setSrdMonsters(rows);
    });
    return () => { cancelled = true; };
  }, [showSrdPicker, srdMonsters]);

  // Esc closes — but only at the outermost view. From the SRD picker
  // or edit form, Esc backs out one level to the list. The DM can
  // still hit the X in the header to close from any view.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (editing) {
        setEditing(null);
      } else if (showSrdPicker) {
        setShowSrdPicker(false);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, showSrdPicker, onClose]);

  async function handleSave() {
    if (!editing) return;
    if (!editing.draft.name.trim()) return;
    setSaving(true);
    const saved = await rosterApi.upsertRosterEntry(
      ownerId, campaignId, editing.draft, editing.entry?.id
    );
    setSaving(false);
    if (!saved) return; // helper logged; toast surfacing for v2.253+
    setEditing(null);
    await reload();
  }

  async function handleDelete(entry: RosterEntry) {
    // Inline confirm — modal-on-modal would be heavier than warranted.
    // The action is irreversible but spawned NPCs don't depend on the
    // roster row (snapshot model) so it's lower-stakes than it looks.
    if (!confirm(`Delete "${entry.name}" from your roster? Spawned NPCs in scenes are unaffected.`)) return;
    const ok = await rosterApi.deleteRosterEntry(entry.id);
    if (ok) await reload();
  }

  const filtered = (roster ?? []).filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.type.toLowerCase().includes(search.toLowerCase())
  );

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '2px solid rgba(239,68,68,0.55)',
          boxShadow: '0 0 40px rgba(239,68,68,0.3), 0 10px 40px rgba(0,0,0,0.8)',
          maxWidth: 560, width: '100%',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(239,68,68,0.12)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase' as const,
              color: '#fca5a5',
            }}>
              {editing ? (editing.entry ? 'Edit Roster Entry' : 'New Roster Entry')
                : showSrdPicker ? 'Clone from SRD'
                : 'Manage NPC Roster'}
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
              color: 'var(--t-1)', marginTop: 2,
            }}>
              {editing ? (editing.draft.name || 'Untitled')
                : showSrdPicker ? `${srdMonsters?.length ?? 0} monsters`
                : `${roster?.length ?? 0} entries`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--t-2)', cursor: 'pointer',
              fontSize: 18, padding: '0 4px',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body — list view, SRD picker, or edit form */}
        {editing ? (
          <EditView
            draft={editing.draft}
            isNew={!editing.entry}
            saving={saving}
            onChange={(patch) => setEditing({ ...editing, draft: { ...editing.draft, ...patch } })}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
          />
        ) : showSrdPicker ? (
          <SrdPickerView
            monsters={srdMonsters}
            onCancel={() => setShowSrdPicker(false)}
            onPick={(m) => {
              // Seed an edit draft from the SRD monster, then drop the
              // picker so saving lands the DM back on the list.
              setEditing({ entry: null, draft: srdApi.monsterToRosterDraft(m) });
              setShowSrdPicker(false);
            }}
          />
        ) : (
          <ListView
            roster={roster}
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            onNew={() => setEditing({ entry: null, draft: { ...EMPTY_DRAFT } })}
            onCloneSrd={() => setShowSrdPicker(true)}
            onEdit={(entry) => setEditing({ entry, draft: entryToDraft(entry) })}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

// Strip the entry shape down to the editable subset for the form. The
// builder never reads/writes id/owner_id/etc. — those are managed by
// the API helpers — so we just lift the draft fields.
function entryToDraft(e: RosterEntry): RosterEntryDraft {
  return {
    name: e.name, type: e.type, cr: e.cr, size: e.size,
    hp: e.hp, max_hp: e.max_hp, ac: e.ac, speed: e.speed,
    str: e.str, dex: e.dex, con: e.con, int: e.int, wis: e.wis, cha: e.cha,
    attack_name: e.attack_name, attack_bonus: e.attack_bonus, attack_damage: e.attack_damage,
    xp: e.xp,
    description: e.description, traits: e.traits, immunities: e.immunities,
    image_url: e.image_url, emoji: e.emoji, color: e.color,
    source_monster_id: e.source_monster_id,
    save_proficiencies: e.save_proficiencies ?? [],
  };
}

// ─── List View ────────────────────────────────────────────────────

function ListView({ roster, filtered, search, setSearch, onNew, onCloneSrd, onEdit, onDelete }: {
  roster: RosterEntry[] | null;
  filtered: RosterEntry[];
  search: string; setSearch: (s: string) => void;
  onNew: () => void;
  onCloneSrd: () => void;
  onEdit: (e: RosterEntry) => void;
  onDelete: (e: RosterEntry) => void;
}) {
  return (
    <>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or type..."
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'var(--c-raised)',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            color: 'var(--t-1)',
            fontSize: 12,
          }}
        />
        {/* v2.254.0 — Clone from SRD: opens the picker over the
            monsters table. Subdued style relative to "+ New" so it
            doesn't compete visually but is the recommended path
            for populating a fresh roster. */}
        <button
          onClick={onCloneSrd}
          title="Clone from the SRD monster catalog (334 entries)"
          style={{
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid rgba(96,165,250,0.5)',
            borderRadius: 4,
            color: '#60a5fa',
            fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap' as const,
          }}
        >
          Clone from SRD
        </button>
        <button
          onClick={onNew}
          style={{
            padding: '6px 12px',
            background: 'rgba(239,68,68,0.18)',
            border: '1px solid rgba(239,68,68,0.55)',
            borderRadius: 4,
            color: '#fca5a5',
            fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap' as const,
          }}
        >
          + New
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {roster === null ? (
          <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
            Loading roster…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
            {search
              ? `No results for "${search}".`
              : 'No NPCs in your roster yet. Click "+ New" to create one.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(npc => (
              <div
                key={npc.id}
                style={{
                  padding: '8px 10px',
                  background: 'var(--c-raised)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 5,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <div style={{
                  width: 8, height: 28, borderRadius: 2,
                  background: npc.color,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 13, color: 'var(--t-1)',
                    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{npc.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-3)' }}>
                    {npc.type} · CR {npc.cr} · HP {npc.hp} · AC {npc.ac}
                    {npc.times_used > 0 && ` · used ${npc.times_used}×`}
                  </div>
                </div>
                <button
                  onClick={() => onEdit(npc)}
                  style={{
                    padding: '4px 10px',
                    background: 'rgba(167,139,250,0.18)',
                    border: '1px solid rgba(167,139,250,0.5)',
                    borderRadius: 4,
                    color: '#a78bfa',
                    fontSize: 10, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >Edit</button>
                <button
                  onClick={() => onDelete(npc)}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 4,
                    color: '#f87171',
                    fontSize: 10, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >Del</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Edit View ────────────────────────────────────────────────────

function EditView({ draft, isNew, saving, onChange, onCancel, onSave }: {
  draft: RosterEntryDraft; isNew: boolean; saving: boolean;
  onChange: (patch: Partial<RosterEntryDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  // Compact label component to keep the form readable. Each row is a
  // grid; labels are 9pt uppercase tracking — matches the visual idiom
  // used in NpcTokenQuickPanel and CharacterSettings.
  const lblStyle = {
    fontSize: 9, color: 'var(--t-3)',
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    display: 'block' as const, marginBottom: 2,
  };
  const inputStyle = {
    width: '100%',
    padding: '5px 8px',
    background: 'var(--c-raised)',
    border: '1px solid var(--c-border)',
    borderRadius: 4,
    color: 'var(--t-1)',
    fontSize: 12,
    boxSizing: 'border-box' as const,
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Name — first thing, always visible */}
        <div>
          <label style={lblStyle}>Name *</label>
          <input
            value={draft.name}
            onChange={e => onChange({ name: e.target.value })}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 700 }}
            autoFocus
          />
        </div>
        {/* Type / CR / Size / XP */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 6 }}>
          <div><label style={lblStyle}>Type</label>
            <input value={draft.type} onChange={e => onChange({ type: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>CR</label>
            <input value={draft.cr} onChange={e => onChange({ cr: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>Size</label>
            <input value={draft.size} onChange={e => onChange({ size: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>XP</label>
            <input type="number" value={draft.xp} onChange={e => onChange({ xp: parseInt(e.target.value, 10) || 0 })} style={inputStyle} /></div>
        </div>
        {/* HP / AC / Speed */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div><label style={lblStyle}>HP</label>
            <input type="number" value={draft.hp} onChange={e => {
              const v = parseInt(e.target.value, 10) || 0;
              // HP edits also bump max_hp — at roster-creation time
              // they're always equal. Per-instance damage tracking
              // happens on the spawned npcs row, not the roster.
              onChange({ hp: v, max_hp: v });
            }} style={inputStyle} /></div>
          <div><label style={lblStyle}>AC</label>
            <input type="number" value={draft.ac} onChange={e => onChange({ ac: parseInt(e.target.value, 10) || 10 })} style={inputStyle} /></div>
          <div><label style={lblStyle}>Speed</label>
            <input type="number" value={draft.speed} onChange={e => onChange({ speed: parseInt(e.target.value, 10) || 30 })} style={inputStyle} /></div>
        </div>
        {/* 6 ability scores in a single row */}
        <div>
          <label style={lblStyle}>Ability Scores</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ability => (
              <div key={ability}>
                <div style={{ fontSize: 9, color: 'var(--t-3)', textAlign: 'center' as const, marginBottom: 1 }}>
                  {ability.toUpperCase()}
                </div>
                <input
                  type="number"
                  value={draft[ability]}
                  onChange={e => onChange({ [ability]: parseInt(e.target.value, 10) || 10 } as Partial<RosterEntryDraft>)}
                  style={{ ...inputStyle, padding: '4px 4px', fontSize: 11, textAlign: 'center' as const }}
                />
              </div>
            ))}
          </div>
        </div>
        {/* v2.253.0 — Save Proficiencies row. One checkbox per ability,
            laid out in the same 6-column grid as the scores above so
            each prof checkbox sits visually below its ability column.
            Toggling a box adds/removes the lowercase ability key from
            the save_proficiencies array. The proficiency bonus itself
            isn't entered here — getTargetSaveBonus derives it from the
            NPC's CR via crToProficiencyBonus(). */}
        <div>
          <label style={lblStyle}>Save Proficiencies</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ability => {
              const isProf = draft.save_proficiencies.includes(ability);
              return (
                <button
                  key={ability}
                  onClick={() => {
                    const next = isProf
                      ? draft.save_proficiencies.filter(a => a !== ability)
                      : [...draft.save_proficiencies, ability];
                    onChange({ save_proficiencies: next });
                  }}
                  title={isProf ? `Remove ${ability.toUpperCase()} save proficiency` : `Add ${ability.toUpperCase()} save proficiency`}
                  style={{
                    padding: '4px 0',
                    background: isProf ? 'rgba(167,139,250,0.22)' : 'var(--c-raised)',
                    border: `1px solid ${isProf ? 'rgba(167,139,250,0.6)' : 'var(--c-border)'}`,
                    borderRadius: 4,
                    color: isProf ? '#a78bfa' : 'var(--t-3)',
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                  }}
                >
                  {isProf ? '●' : '○'}
                </button>
              );
            })}
          </div>
        </div>
        {/* Attack — name / bonus / damage */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 6 }}>
          <div><label style={lblStyle}>Attack Name</label>
            <input value={draft.attack_name} onChange={e => onChange({ attack_name: e.target.value })} style={inputStyle} /></div>
          <div><label style={lblStyle}>Bonus</label>
            <input type="number" value={draft.attack_bonus} onChange={e => onChange({ attack_bonus: parseInt(e.target.value, 10) || 0 })} style={inputStyle} /></div>
          <div><label style={lblStyle}>Damage</label>
            <input value={draft.attack_damage} onChange={e => onChange({ attack_damage: e.target.value })} style={inputStyle} placeholder="1d6+2" /></div>
        </div>
        {/* Immunities — single-line, comma-separated */}
        <div>
          <label style={lblStyle}>Immunities (comma-separated, e.g. poison, charmed)</label>
          <input value={draft.immunities} onChange={e => onChange({ immunities: e.target.value })} style={inputStyle} />
        </div>
        {/* Description / Traits — textareas, both small to keep the
            modal manageable */}
        <div>
          <label style={lblStyle}>Description</label>
          <textarea
            value={draft.description}
            onChange={e => onChange({ description: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }}
          />
        </div>
        <div>
          <label style={lblStyle}>Traits & Abilities</label>
          <textarea
            value={draft.traits}
            onChange={e => onChange({ traits: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }}
          />
        </div>
        {/* Color picker — visual differentiation in the picker. */}
        <div>
          <label style={lblStyle}>Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TOKEN_COLORS.map(c => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  border: draft.color === c ? '3px solid var(--t-1)' : '2px solid transparent',
                  flexShrink: 0,
                  padding: 0,
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>
      {/* Footer — Cancel + Save. Save is gated on a non-empty name. */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-raised)',
        display: 'flex', justifyContent: 'flex-end', gap: 8,
      }}>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            color: 'var(--t-2)',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}
        >Cancel</button>
        <button
          onClick={onSave}
          disabled={!draft.name.trim() || saving}
          style={{
            padding: '6px 16px',
            background: 'rgba(239,68,68,0.22)',
            border: '1px solid rgba(239,68,68,0.6)',
            borderRadius: 4,
            color: '#fca5a5',
            fontSize: 12, fontWeight: 700,
            cursor: !draft.name.trim() || saving ? 'not-allowed' : 'pointer',
            opacity: !draft.name.trim() || saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

// ─── SRD Picker View ──────────────────────────────────────────────

function SrdPickerView({ monsters, onCancel, onPick }: {
  monsters: SrdMonsterRow[] | null;
  onCancel: () => void;
  onPick: (m: SrdMonsterRow) => void;
}) {
  // Local search for the picker. Resets each time the picker is
  // opened (the parent unmounts this component on close).
  const [search, setSearch] = useState('');
  const filtered = (monsters ?? []).filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.name.toLowerCase().includes(s) || m.type.toLowerCase().includes(s);
  });

  return (
    <>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SRD by name or type..."
          autoFocus
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'var(--c-raised)',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            color: 'var(--t-1)',
            fontSize: 12,
          }}
        />
        <button
          onClick={onCancel}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            color: 'var(--t-2)',
            fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {monsters === null ? (
          <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
            Loading SRD catalog…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
            No results for "{search}".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(m => {
              // Compact summary chip — shows save profs only when the
              // monster carries them, so DMs can spot which entries
              // will land with auto-derived proficiencies. The chip
              // itself isn't editable here; the edit form has the
              // toggle UI from v2.253.
              const profCount = m.saving_throws ? Object.keys(m.saving_throws).length : 0;
              return (
                <button
                  key={m.id}
                  onClick={() => onPick(m)}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--c-raised)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 5,
                    display: 'flex', alignItems: 'center', gap: 8,
                    textAlign: 'left' as const,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.10)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-raised)'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 13, color: 'var(--t-1)',
                      whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-3)' }}>
                      {m.type}
                      {m.subtype ? ` (${m.subtype})` : ''}
                      {' · '}CR {m.cr}
                      {' · '}HP {m.hp}
                      {' · '}AC {m.ac}
                      {profCount > 0 && (
                        <span style={{ color: '#a78bfa', marginLeft: 6 }}>
                          · {profCount} prof save{profCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 8px',
                    background: 'rgba(96,165,250,0.18)',
                    border: '1px solid rgba(96,165,250,0.5)',
                    borderRadius: 4,
                    color: '#60a5fa',
                    fontSize: 10, fontWeight: 700,
                  }}>Clone →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
