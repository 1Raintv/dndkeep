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
import * as homebrewApi from '../../lib/api/homebrewMonsters';
import type { RosterEntry, RosterEntryDraft } from '../../lib/api/npcRoster';
import type { SrdMonsterRow } from '../../lib/api/srdMonsters';
import type { HomebrewMonsterRow } from '../../lib/api/homebrewMonsters';

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
  // v2.262.0 — picker is now tabbed: 'srd' | 'homebrew'. The SRD tab
  // is lazy-loaded on first picker-open (v2.254 behavior); the
  // homebrew tab is lazy-loaded on first activation. Switching tabs
  // doesn't re-fetch.
  const [srdMonsters, setSrdMonsters] = useState<SrdMonsterRow[] | null>(null);
  const [homebrewMonsters, setHomebrewMonsters] = useState<HomebrewMonsterRow[] | null>(null);
  const [showSrdPicker, setShowSrdPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'srd' | 'homebrew'>('srd');

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

  // v2.262.0 — same lazy-load pattern for homebrew. Triggers when the
  // picker is open AND the homebrew tab is active AND we haven't
  // loaded yet. RLS scopes to the calling user, so no userId param
  // needed in the API call.
  useEffect(() => {
    if (!showSrdPicker) return;
    if (pickerTab !== 'homebrew') return;
    if (homebrewMonsters !== null) return;
    let cancelled = false;
    homebrewApi.listHomebrew().then(rows => {
      if (cancelled) return;
      setHomebrewMonsters(rows);
    });
    return () => { cancelled = true; };
  }, [showSrdPicker, pickerTab, homebrewMonsters]);

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

  // v2.261.0 — Save the current draft as a personal homebrew monster
  // template (independent of the roster). This is the "I want this
  // available across all my future campaigns" save. Doesn't close
  // the modal — DM might also want to Save to Roster afterward to
  // get it into the active campaign's encounter list. A transient
  // chip appears on the Save as Homebrew button to confirm the save.
  const [homebrewSavedAt, setHomebrewSavedAt] = useState<number | null>(null);
  async function handleSaveAsHomebrew() {
    if (!editing) return;
    if (!editing.draft.name.trim()) return;
    setSaving(true);
    const saved = await homebrewApi.createHomebrewFromDraft(ownerId, editing.draft);
    setSaving(false);
    if (!saved) return;
    // v2.262.0 — invalidate the picker's homebrew cache so the next
    // picker-open re-fetches and shows the freshly-saved entry. Set
    // to null rather than appending — the lazy-load effect handles
    // the refetch and avoids ordering bugs (would have to re-sort
    // alphabetically here otherwise).
    setHomebrewMonsters(null);
    // Flash a "Saved!" indicator for 2 seconds without closing the
    // form. Keeps the DM in flow if they want to also Save to Roster.
    const savedAt = Date.now();
    setHomebrewSavedAt(savedAt);
    setTimeout(() => {
      // Only clear if no newer save happened in the meantime.
      setHomebrewSavedAt(curr => curr === savedAt ? null : curr);
    }, 2000);
  }
  // Reset the confirmation chip when the editing draft changes (i.e.
  // the DM moved on to a different entry).
  useEffect(() => {
    setHomebrewSavedAt(null);
  }, [editing?.entry?.id, editing?.draft.name]);

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
                : showSrdPicker ? (pickerTab === 'srd' ? 'Clone from SRD' : 'Clone from Homebrew')
                : 'Manage NPC Roster'}
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
              color: 'var(--t-1)', marginTop: 2,
            }}>
              {editing ? (editing.draft.name || 'Untitled')
                : showSrdPicker ? (
                  pickerTab === 'srd'
                    ? `${srdMonsters?.length ?? 0} monsters`
                    : `${homebrewMonsters?.length ?? 0} ${(homebrewMonsters?.length ?? 0) === 1 ? 'template' : 'templates'}`
                )
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
            homebrewSavedAt={homebrewSavedAt}
            onChange={(patch) => setEditing({ ...editing, draft: { ...editing.draft, ...patch } })}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
            onSaveAsHomebrew={handleSaveAsHomebrew}
          />
        ) : showSrdPicker ? (
          <SourcePickerView
            tab={pickerTab}
            onTabChange={setPickerTab}
            srdMonsters={srdMonsters}
            homebrewMonsters={homebrewMonsters}
            onCancel={() => setShowSrdPicker(false)}
            onPickSrd={(m) => {
              // Seed an edit draft from the SRD monster, then drop the
              // picker so saving lands the DM back on the list.
              setEditing({ entry: null, draft: srdApi.monsterToRosterDraft(m) });
              setShowSrdPicker(false);
            }}
            onPickHomebrew={(m) => {
              // Same flow as SRD pick, but using the homebrew mapper
              // (which also stamps source_monster_id with the
              // 'homebrew:<uuid>' prefix from v2.261).
              setEditing({ entry: null, draft: homebrewApi.homebrewToRosterDraft(m) });
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
            for populating a fresh roster.
            v2.262.0 — picker is now tabbed (SRD + Homebrew) so the
            label drops the source qualifier. */}
        <button
          onClick={onCloneSrd}
          title="Clone from the SRD catalog (334 entries) or your homebrew templates"
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
          Clone…
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

function EditView({ draft, isNew, saving, homebrewSavedAt, onChange, onCancel, onSave, onSaveAsHomebrew }: {
  draft: RosterEntryDraft; isNew: boolean; saving: boolean;
  /** v2.261.0 — timestamp of last successful "Save as Homebrew".
   *  Non-null for ~2 seconds after a save → renders the confirmation
   *  chip on the button. Reset to null when the draft identity
   *  changes (parent useEffect). */
  homebrewSavedAt: number | null;
  onChange: (patch: Partial<RosterEntryDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAsHomebrew: () => void;
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
      {/* Footer — Cancel · Save as Homebrew · Save to Roster.
          Three independent actions:
          - Cancel: discard changes
          - Save as Homebrew (v2.261.0): persist as a reusable per-user
            template in homebrew_monsters. Doesn't close the modal —
            DM may also want to save to the active roster.
          - Save to Roster: original behavior; persists to dm_npc_roster
            scoped to this campaign and closes the modal.
          All three are gated on a non-empty name. */}
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
          onClick={onSaveAsHomebrew}
          disabled={!draft.name.trim() || saving}
          title="Save as a reusable homebrew template (available across all your campaigns)"
          style={{
            padding: '6px 14px',
            background: homebrewSavedAt != null
              ? 'rgba(34,197,94,0.22)'
              : 'rgba(96,165,250,0.18)',
            border: `1px solid ${homebrewSavedAt != null
              ? 'rgba(34,197,94,0.65)'
              : 'rgba(96,165,250,0.55)'}`,
            borderRadius: 4,
            color: homebrewSavedAt != null ? '#86efac' : '#93c5fd',
            fontSize: 12, fontWeight: 700,
            cursor: !draft.name.trim() || saving ? 'not-allowed' : 'pointer',
            opacity: !draft.name.trim() || saving ? 0.5 : 1,
            transition: 'background 200ms, border-color 200ms, color 200ms',
          }}
        >
          {homebrewSavedAt != null ? '✓ Saved to Homebrew' : 'Save as Homebrew'}
        </button>
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
          {saving ? 'Saving…' : isNew ? 'Save to Roster' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

// ─── Source Picker View — SRD + Homebrew tabs ────────────────────
//
// v2.262.0 — was SrdPickerView (single source). Promoted to a tabbed
// picker that handles both the SRD catalog and the user's personal
// homebrew library. The two tabs share the same row-card visual
// idiom but use different accent colors (blue for SRD, green for
// homebrew) so the DM can tell at a glance which source they're
// browsing. The pick handlers are different (different mappers) and
// flow through to the parent.

function SourcePickerView({
  tab, onTabChange,
  srdMonsters, homebrewMonsters,
  onCancel, onPickSrd, onPickHomebrew,
}: {
  tab: 'srd' | 'homebrew';
  onTabChange: (t: 'srd' | 'homebrew') => void;
  srdMonsters: SrdMonsterRow[] | null;
  homebrewMonsters: HomebrewMonsterRow[] | null;
  onCancel: () => void;
  onPickSrd: (m: SrdMonsterRow) => void;
  onPickHomebrew: (m: HomebrewMonsterRow) => void;
}) {
  // Local search resets when the picker mounts but persists across
  // tab switches — DMs often search the same term across sources
  // ("goblin" → SRD has the canonical, homebrew has my Boss Goblin).
  const [search, setSearch] = useState('');

  // Tab-specific accent colors, used for the search bar's focus tint
  // (subtle) and the row Clone-→ chip (the strong cue).
  const accent = tab === 'srd'
    ? { ring: 'rgba(96,165,250,0.5)', bg: 'rgba(96,165,250,0.18)', text: '#60a5fa', hover: 'rgba(96,165,250,0.10)' }
    : { ring: 'rgba(34,197,94,0.5)',  bg: 'rgba(34,197,94,0.18)',  text: '#4ade80', hover: 'rgba(34,197,94,0.10)' };

  return (
    <>
      {/* Tab strip — sits above the search bar so the DM picks the
          source first, then narrows. Chosen over a dropdown because
          the two sources have different shapes (count + workflow)
          and a tab makes that obvious. */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-card)',
      }}>
        {(['srd', 'homebrew'] as const).map(t => {
          const isActive = tab === t;
          const count = t === 'srd'
            ? (srdMonsters?.length ?? null)
            : (homebrewMonsters?.length ?? null);
          const accentText = t === 'srd' ? '#60a5fa' : '#4ade80';
          const accentBorder = t === 'srd' ? 'rgba(96,165,250,0.7)' : 'rgba(34,197,94,0.7)';
          return (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${accentBorder}` : '2px solid transparent',
                color: isActive ? accentText : 'var(--t-2)',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                cursor: 'pointer',
                marginBottom: -1, // overlap the parent border so the active underline lands on it
              }}
            >
              {t === 'srd' ? 'SRD' : 'Homebrew'}
              {count != null && (
                <span style={{
                  marginLeft: 6, fontSize: 9,
                  opacity: 0.7,
                  fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search bar + Back button. Search box is autofocused so the
          picker is keyboard-navigable from the moment it opens. */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'srd' ? 'Search SRD by name or type…' : 'Search your homebrew templates…'}
          autoFocus
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'var(--c-raised)',
            border: `1px solid ${accent.ring}`,
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

      {/* Body — render the tab's data. Filter is shared between tabs
          (same search box) but the data shape differs (SRD has subtype,
          homebrew doesn't), so each branch has its own row template. */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {tab === 'srd'
          ? <SrdResults monsters={srdMonsters} search={search} onPick={onPickSrd} accent={accent} />
          : <HomebrewResults monsters={homebrewMonsters} search={search} onPick={onPickHomebrew} accent={accent} />
        }
      </div>
    </>
  );
}

// ─── SRD results list (extracted from old SrdPickerView body) ───────

function SrdResults({ monsters, search, onPick, accent }: {
  monsters: SrdMonsterRow[] | null;
  search: string;
  onPick: (m: SrdMonsterRow) => void;
  accent: { ring: string; bg: string; text: string; hover: string };
}) {
  if (monsters === null) {
    return (
      <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
        Loading SRD catalog…
      </div>
    );
  }
  const filtered = monsters.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.name.toLowerCase().includes(s) || m.type.toLowerCase().includes(s);
  });
  if (filtered.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
        No SRD results for "{search}".
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {filtered.map(m => {
        // Compact summary chip — shows save profs only when the
        // monster carries them, so DMs can spot which entries will
        // land with auto-derived proficiencies. The chip itself isn't
        // editable here; the edit form has the toggle UI from v2.253.
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = accent.hover; }}
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
              background: accent.bg,
              border: `1px solid ${accent.ring}`,
              borderRadius: 4,
              color: accent.text,
              fontSize: 10, fontWeight: 700,
            }}>Clone →</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Homebrew results list ─────────────────────────────────────────
//
// v2.262.0 — parallel to SrdResults but with the leaner homebrew
// row shape (no subtype, no saving_throws) and a richer empty state
// that explicitly tells DMs how to populate the table (via the
// v2.261 "Save as Homebrew" button) since this tab will be empty
// for any DM until they author at least one.

function HomebrewResults({ monsters, search, onPick, accent }: {
  monsters: HomebrewMonsterRow[] | null;
  search: string;
  onPick: (m: HomebrewMonsterRow) => void;
  accent: { ring: string; bg: string; text: string; hover: string };
}) {
  if (monsters === null) {
    return (
      <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
        Loading your homebrew templates…
      </div>
    );
  }
  if (monsters.length === 0) {
    return (
      <div style={{
        padding: '24px 20px',
        textAlign: 'center' as const,
        color: 'var(--t-3)',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <div style={{ fontSize: 20, marginBottom: 8, opacity: 0.6 }}>📚</div>
        <div style={{ fontWeight: 700, color: 'var(--t-2)', marginBottom: 6 }}>
          No homebrew templates yet
        </div>
        <div style={{ fontSize: 11, maxWidth: 360, margin: '0 auto' }}>
          When editing a roster entry (or after cloning from SRD),
          click <span style={{ color: '#93c5fd', fontWeight: 700 }}>Save as Homebrew</span> to
          add it here. Templates are reusable across all your campaigns.
        </div>
      </div>
    );
  }
  const filtered = monsters.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.name.toLowerCase().includes(s) || (m.type ?? '').toLowerCase().includes(s);
  });
  if (filtered.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center' as const, color: 'var(--t-3)', fontSize: 12 }}>
        No homebrew results for "{search}".
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {filtered.map(m => (
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
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = accent.hover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-raised)'; }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 700, fontSize: 13, color: 'var(--t-1)',
              whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{m.name}</div>
            <div style={{ fontSize: 10, color: 'var(--t-3)' }}>
              {m.type ?? 'Custom'}
              {m.cr != null && ` · CR ${m.cr}`}
              {m.hp != null && ` · HP ${m.hp}`}
              {m.ac != null && ` · AC ${m.ac}`}
            </div>
          </div>
          <span style={{
            padding: '3px 8px',
            background: accent.bg,
            border: `1px solid ${accent.ring}`,
            borderRadius: 4,
            color: accent.text,
            fontSize: 10, fontWeight: 700,
          }}>Clone →</span>
        </button>
      ))}
    </div>
  );
}
