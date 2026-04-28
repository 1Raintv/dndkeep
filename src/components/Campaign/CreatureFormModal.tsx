// v2.351.0 — Unified Creature form modal.
//
// Replaces the v2.169 NPC form which had ONLY story fields (name,
// role, faction, location, description, notes) and no way to add
// the combat stats needed for an actual fight. User feedback:
// "the NPC window is way too small and is unusable because I can't
// add anything to it."
//
// New shape: 1100px wide modal, two-column grid inside.
//   • Left column: Combat stats (HP, AC, speed, abilities, attack)
//   • Right column: Story fields (description, role, faction, etc.)
//   • Top bar: name, image URL, folder picker, import-from-catalog button
//
// Extra tabs would have helped but flat is friendlier — one form,
// scroll if needed. The "Import from Catalog" button is its own
// inline picker that the user can ignore for fully custom creatures.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CreatureRow } from '../../lib/api/creatures';
import { listFolders, type CreatureFolderRow } from '../../lib/api/creatureFolders';

const ROLES = ['ally', 'enemy', 'neutral', 'merchant', 'quest-giver', 'boss', 'unknown'];
const RELATIONSHIPS = ['friendly', 'neutral', 'hostile', 'unknown', 'feared', 'trusted'];
const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental',
  'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
];

interface Props {
  creature: Partial<CreatureRow>;
  campaignId: string;
  onChange: (c: Partial<CreatureRow>) => void;
  onSave: () => Promise<void> | void;
  onClose: () => void;
  onOpenCatalogImport?: () => void;
  saving?: boolean;
}

export default function CreatureFormModal({
  creature, campaignId, onChange, onSave, onClose, onOpenCatalogImport, saving,
}: Props) {
  const [folders, setFolders] = useState<CreatureFolderRow[]>([]);

  useEffect(() => {
    let alive = true;
    listFolders(campaignId)
      .then(rows => { if (alive) setFolders(rows); })
      .catch(err => console.error('[CreatureFormModal] listFolders failed', err));
    return () => { alive = false; };
  }, [campaignId]);

  const isEditing = Boolean((creature as CreatureRow).id);
  const valid = (creature.name ?? '').trim().length > 0;

  function set<K extends keyof CreatureRow>(key: K, value: CreatureRow[K]) {
    onChange({ ...creature, [key]: value });
  }

  function setNum<K extends keyof CreatureRow>(key: K, raw: string) {
    if (raw === '') { onChange({ ...creature, [key]: null as any }); return; }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    onChange({ ...creature, [key]: n as any });
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          maxWidth: 1100, width: '94vw',
          maxHeight: '90vh',
          padding: 0,
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        }}>
          <h3 style={{ flex: 1, margin: 0 }}>
            {isEditing ? 'Edit' : 'New'} Creature
          </h3>
          {!isEditing && onOpenCatalogImport && (
            <button
              className="btn-secondary btn-sm"
              onClick={onOpenCatalogImport}
              title="Pick a creature from the SRD bestiary as a starting point"
            >
              Import from Catalog
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body — two-column grid */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 24px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)',
        }}>
          {/* === LEFT: Combat stats === */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="section-header" style={{ marginTop: 0 }}>Combat</div>

            <div>
              <label>Name *</label>
              <input
                value={creature.name ?? ''}
                onChange={e => set('name', e.target.value)}
                autoFocus
                placeholder="Goblin Boss, Lord Vetra, Mom…"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>HP (current)</label>
                <input type="number" value={creature.hp ?? ''} onChange={e => setNum('hp', e.target.value)} />
              </div>
              <div>
                <label>HP (max)</label>
                <input type="number" value={creature.max_hp ?? ''} onChange={e => setNum('max_hp', e.target.value)} />
              </div>
              <div>
                <label>AC</label>
                <input type="number" value={creature.ac ?? ''} onChange={e => setNum('ac', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>Speed (ft)</label>
                <input type="number" value={creature.speed ?? ''} onChange={e => setNum('speed', e.target.value)} placeholder="30" />
              </div>
              <div>
                <label>CR</label>
                <input value={creature.cr ?? ''} onChange={e => set('cr', e.target.value)} placeholder='"0", "1/4", "5"…' />
              </div>
              <div>
                <label>XP</label>
                <input type="number" value={creature.xp ?? ''} onChange={e => setNum('xp', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--sp-2)' }}>
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ab => (
                <div key={ab}>
                  <label style={{ textTransform: 'uppercase' }}>{ab}</label>
                  <input
                    type="number"
                    value={(creature as any)[ab] ?? ''}
                    onChange={e => setNum(ab as keyof CreatureRow, e.target.value)}
                    placeholder="10"
                  />
                </div>
              ))}
            </div>

            <div>
              <label>Primary Attack</label>
              <input
                value={creature.attack_name ?? ''}
                onChange={e => set('attack_name', e.target.value)}
                placeholder="Scimitar, Bite, Multiattack…"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>Attack Bonus</label>
                <input type="number" value={creature.attack_bonus ?? ''} onChange={e => setNum('attack_bonus', e.target.value)} placeholder="+4" />
              </div>
              <div>
                <label>Damage</label>
                <input value={creature.attack_damage ?? ''} onChange={e => set('attack_damage', e.target.value)} placeholder="1d6+2 slashing" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>Type</label>
                <select value={creature.type ?? 'humanoid'} onChange={e => set('type', e.target.value)}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Size</label>
                <select value={creature.size ?? 'medium'} onChange={e => set('size', e.target.value)}>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* === RIGHT: Story / organization === */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="section-header" style={{ marginTop: 0 }}>Story & Organization</div>

            <div>
              <label>Folder</label>
              <select value={creature.folder_id ?? ''} onChange={e => set('folder_id', e.target.value || null)}>
                <option value="">— Unfiled —</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>Role</label>
                <select value={creature.role ?? 'neutral'} onChange={e => set('role', e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label>Relationship</label>
                <select value={creature.relationship ?? 'neutral'} onChange={e => set('relationship', e.target.value)}>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>Race / Species</label>
                <input value={creature.race ?? ''} onChange={e => set('race', e.target.value)} placeholder="Human, Elf, Dragon…" />
              </div>
              <div>
                <label>Faction</label>
                <input value={creature.faction ?? ''} onChange={e => set('faction', e.target.value)} placeholder="Thieves Guild, Crown…" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div>
                <label>Current Location</label>
                <input value={creature.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="The Rusty Flagon…" />
              </div>
              <div>
                <label>Last Seen</label>
                <input value={creature.last_seen ?? ''} onChange={e => set('last_seen', e.target.value)} placeholder="Session 3" />
              </div>
            </div>

            <div>
              <label>Image URL</label>
              <input
                value={creature.image_url ?? ''}
                onChange={e => set('image_url', e.target.value)}
                placeholder="https://example.com/portrait.png"
              />
            </div>

            <div>
              <label>Description (visible to players)</label>
              <textarea
                value={creature.description ?? ''}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="What the party knows about this character…"
              />
            </div>

            <div>
              <label>DM Notes (private)</label>
              <textarea
                value={creature.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                placeholder="Secrets, motivations, planned scenes, stat-block sources…"
              />
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              cursor: 'pointer', fontFamily: 'var(--ff-body)',
              fontSize: 'var(--fs-sm)', color: 'var(--t-2)',
              textTransform: 'none', letterSpacing: 0, marginBottom: 0,
            }}>
              <input
                type="checkbox"
                checked={creature.visible_to_players ?? true}
                onChange={e => set('visible_to_players', e.target.checked)}
              />
              Visible to players (uncheck for hidden DM-only creatures)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)',
        }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn-gold"
            onClick={() => { void onSave(); }}
            disabled={saving || !valid}
          >
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Creature'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
