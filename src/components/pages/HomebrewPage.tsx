import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CLASSES } from '../../data/classes';
import { useClassRegistry, type ClassEntry } from '../../lib/classRegistry';
import { supabase } from '../../lib/supabase';
import type { SubclassData, SubclassFeature } from '../../types';

const ABILITIES = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];
const ALL_SKILLS = ['Acrobatics','Animal Handling','Arcana','Athletics','Deception','History',
  'Insight','Intimidation','Investigation','Medicine','Nature','Perception','Performance',
  'Persuasion','Religion','Sleight of Hand','Stealth','Survival'];
const HIT_DICE = [6, 8, 10, 12];

const emptySubclass = (): Partial<SubclassData> => ({
  name: '', description: '', unlock_level: 3, source: 'homebrew', features: [], spell_list: [],
});

const emptyFeature = (): SubclassFeature => ({
  level: 3, name: '', description: '', mechanics: [],
});

export default function HomebrewPage() {
  const { user, isPro, showUaContent } = useAuth();
  const { classes, loading, refresh } = useClassRegistry(user?.id);
  const [tab, setTab] = useState<'browse' | 'create'>('browse');
  const [editing, setEditing] = useState<Partial<ClassEntry> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const homebrew = classes.filter(c => c.source === 'homebrew' && (c as ClassEntry).owner_id === user?.id);
  // v2.329.0 — T7: only surface UA / playtest classes when the account
  // has opted in via show_ua_content. Default-false accounts see an
  // empty array here, which collapses the UA section entirely.
  const ua = showUaContent ? classes.filter(c => c.source === 'ua') : [];

  function newClass(): any {
    return {
      name: '', description: '', hit_die: 8,
      primary_abilities: [], saving_throw_proficiencies: [],
      skill_choices: [], skill_count: 2,
      armor_proficiencies: [], weapon_proficiencies: [], tool_proficiencies: [],
      is_spellcaster: false, spellcasting_ability: null, spellcaster_type: 'none',
      subclasses: [], source: 'homebrew', is_public: false,
    };
  }

  async function save() {
    if (!editing?.name?.trim() || !user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: editing.name!.trim(),
      description: editing.description ?? '',
      hit_die: editing.hit_die ?? 8,
      primary_abilities: editing.primary_abilities ?? [],
      saving_throw_proficiencies: editing.saving_throw_proficiencies ?? [],
      skill_choices: editing.skill_choices ?? [],
      skill_count: editing.skill_count ?? 2,
      armor_proficiencies: editing.armor_proficiencies ?? [],
      weapon_proficiencies: editing.weapon_proficiencies ?? [],
      tool_proficiencies: editing.tool_proficiencies ?? [],
      is_spellcaster: editing.is_spellcaster ?? false,
      spellcasting_ability: editing.is_spellcaster ? (editing.spellcasting_ability ?? 'intelligence') : null,
      spellcaster_type: editing.is_spellcaster ? (editing.spellcaster_type ?? 'full') : 'none',
      subclasses: editing.subclasses ?? [],
      is_public: (editing as ClassEntry).is_public ?? false,
    };

    const existingId = (editing as ClassEntry).id;
    if (existingId) {
      await supabase.from('homebrew_classes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existingId);
    } else {
      await supabase.from('homebrew_classes').insert(payload);
    }

    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2000);
    await refresh();
    setEditing(null);
    setTab('browse');
    setSaving(false);
  }

  async function deleteClass(id: string) {
    if (!confirm('Delete this homebrew class?')) return;
    await supabase.from('homebrew_classes').delete().eq('id', id);
    await refresh();
  }

  if (!isPro) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}></div>
        <h2 style={{ marginBottom: 12 }}>Homebrew Workshop</h2>
        <p style={{ color: 'var(--t-2)', marginBottom: 24, lineHeight: 1.7 }}>
          Create custom classes and subclasses, or import UA content.<br />
          Available on the Pro plan.
        </p>
        <button className="btn-gold">Upgrade to Pro</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Homebrew Workshop</h2>
          <p style={{ fontSize: 13, color: 'var(--t-3)', margin: 0 }}>
            Custom classes merge automatically with official content everywhere in the app.
          </p>
        </div>
        <button className="btn-gold btn-sm" onClick={() => { setEditing(newClass()); setTab('create'); }}>
          + New Class
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--c-border)' }}>
        {([['browse','Browse'], ['create', editing ? 'Editor' : 'Create']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            fontWeight: 700, fontSize: 12, padding: '7px 16px', background: 'transparent', border: 'none',
            borderBottom: tab === id ? '2px solid var(--c-gold)' : '2px solid transparent',
            color: tab === id ? 'var(--c-gold-l)' : 'var(--t-2)', cursor: 'pointer', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {tab === 'browse' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* UA Subclasses */}
          {ua.length > 0 && (
            <section>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a78bfa', marginBottom: 10 }}>
                Unearthed Arcana 2026 — {ua.flatMap(c => c.subclasses.filter(s => s.source === 'ua')).length} Subclasses
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {CLASSES.map(cls =>
                  cls.subclasses.filter(s => s.source === 'ua').map(sub => (
                    <UACard key={`${cls.name}-${sub.name}`} className={cls.name} sub={sub} />
                  ))
                )}
              </div>
            </section>
          )}

          {/* My Homebrew */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-gold-l)', marginBottom: 10 }}>
              My Homebrew Classes ({homebrew.length})
            </div>
            {homebrew.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-3)', fontSize: 13, border: '1px dashed var(--c-border)', borderRadius: 12 }}>
                No homebrew classes yet. Click "+ New Class" to create one.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {homebrew.map(c => (
                  <HomebrewCard key={(c as ClassEntry).id} cls={c as ClassEntry}
                    onEdit={() => { setEditing(c); setTab('create'); }}
                    onDelete={() => deleteClass((c as ClassEntry).id!)} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── EDITOR ── */}
      {tab === 'create' && (
        <ClassEditor
          value={editing ?? newClass()}
          onChange={setEditing}
          onSave={save}
          onCancel={() => { setEditing(null); setTab('browse'); }}
          saving={saving}
          saveMsg={saveMsg}
        />
      )}
    </div>
  );
}

// ── UA Card ────────────────────────────────────────────────────────────────────
function UACard({ className, sub }: { className: string; sub: SubclassData }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'var(--c-card)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }} onClick={() => setOpen(v => !v)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{sub.name}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 6px', borderRadius: 999 }}>UA 2026</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>{className} · Unlocks at level {sub.unlock_level}</div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--t-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, margin: 0 }}>{sub.description}</p>
          {sub.features && sub.features.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sub.features.map(f => (
                <div key={f.name} style={{ padding: '6px 8px', background: 'var(--c-raised)', borderRadius: 6, borderLeft: '2px solid rgba(167,139,250,0.4)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>Lv {f.level} — {f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-2)', marginTop: 2, lineHeight: 1.5 }}>{f.description}</div>
                  {f.mechanics?.map((m, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 3 }}>
                      [{m.type}] {m.details}{m.dice ? ` · ${m.dice}` : ''}{m.ability ? ` · ${m.ability}` : ''}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Homebrew Card ─────────────────────────────────────────────────────────────
function HomebrewCard({ cls, onEdit, onDelete }: { cls: ClassEntry; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-gold-l)' }}>{cls.name}</div>
          <div style={{ fontSize: 11, color: 'var(--t-3)' }}>d{cls.hit_die} · {cls.subclasses.length} subclass{cls.subclasses.length !== 1 ? 'es' : ''} · {cls.is_spellcaster ? cls.spellcaster_type + ' caster' : 'Non-caster'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onEdit} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-2)' }}>Edit</button>
          <button onClick={onDelete} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', color: '#f87171' }}>Delete</button>
        </div>
      </div>
      {(cls as any).description && <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5, margin: 0 }}>{(cls as any).description}</p>}
      {cls.is_public && <span style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', padding: '1px 6px', borderRadius: 999, width: 'fit-content' }}>Public</span>}
    </div>
  );
}

// ── Class Editor ──────────────────────────────────────────────────────────────
function ClassEditor({ value, onChange, onSave, onCancel, saving, saveMsg }: {
  value: any;
  onChange: (v: any) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveMsg: string;
}) {
  const set = (patch: any) => onChange({ ...value, ...patch });
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);

  function toggleArr(field: keyof ClassEntry, val: string) {
    const arr = (value[field] as string[]) ?? [];
    set({ [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-gold-l)' }}>
        {(value as ClassEntry).id ? `Editing: ${value.name}` : 'New Homebrew Class'}
      </div>

      {/* ── IDENTITY ── */}
      <Section title="Class Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Class Name *">
            <input value={value.name ?? ''} onChange={e => set({ name: e.target.value })} placeholder="Shadow Dancer" autoFocus />
          </Field>
          <Field label="Hit Die">
            <select value={value.hit_die ?? 8} onChange={e => set({ hit_die: Number(e.target.value) })}>
              {HIT_DICE.map(d => <option key={d} value={d}>d{d}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea value={value.description ?? ''} onChange={e => set({ description: e.target.value })} rows={2} placeholder="A master of the shadows who..." />
        </Field>
      </Section>

      {/* ── ABILITIES ── */}
      <Section title="Abilities & Proficiencies">
        <Field label="Primary Abilities">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ABILITIES.map(a => (
              <Toggle key={a} active={(value.primary_abilities ?? []).includes(a)} onClick={() => toggleArr('primary_abilities', a)} label={a.slice(0,3).toUpperCase()} />
            ))}
          </div>
        </Field>
        <Field label="Saving Throw Proficiencies">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ABILITIES.map(a => (
              <Toggle key={a} active={(value.saving_throw_proficiencies ?? []).includes(a)} onClick={() => toggleArr('saving_throw_proficiencies', a)} label={a.slice(0,3).toUpperCase()} />
            ))}
          </div>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="Skill Choices">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {ALL_SKILLS.map(s => (
                <Toggle key={s} active={(value.skill_choices ?? []).includes(s)} onClick={() => toggleArr('skill_choices', s)} label={s.length > 9 ? s.slice(0,8)+'…' : s} small />
              ))}
            </div>
          </Field>
          <Field label="# Choices">
            <input type="number" min={1} max={6} value={value.skill_count ?? 2} onChange={e => set({ skill_count: Number(e.target.value) })} style={{ width: 60 }} />
          </Field>
        </div>
        <Field label="Armor Proficiencies">
          <input value={(value.armor_proficiencies ?? []).join(', ')} onChange={e => set({ armor_proficiencies: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="Light Armor, Medium Armor, Shields" />
        </Field>
        <Field label="Weapon Proficiencies">
          <input value={(value.weapon_proficiencies ?? []).join(', ')} onChange={e => set({ weapon_proficiencies: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="Simple Weapons, Martial Weapons" />
        </Field>
      </Section>

      {/* ── SPELLCASTING ── */}
      <Section title="Spellcasting">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 13, textTransform: 'none', letterSpacing: 0, marginBottom: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={value.is_spellcaster ?? false} onChange={e => set({ is_spellcaster: e.target.checked, spellcaster_type: e.target.checked ? 'full' : 'none' })} />
          This class can cast spells
        </label>
        {value.is_spellcaster && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Spellcasting Ability">
              <select value={value.spellcasting_ability ?? 'intelligence'} onChange={e => set({ spellcasting_ability: e.target.value as any })}>
                {ABILITIES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Caster Type">
              <select value={value.spellcaster_type ?? 'full'} onChange={e => set({ spellcaster_type: e.target.value as any })}>
                <option value="full">Full (Wizard / Cleric)</option>
                <option value="half">Half (Ranger / Paladin)</option>
                <option value="warlock">Pact (Warlock)</option>
              </select>
            </Field>
          </div>
        )}
      </Section>

      {/* ── SUBCLASSES ── */}
      <Section title={`Subclasses (${(value.subclasses ?? []).length})`} action={
        <button onClick={() => {
          const subs = [...(value.subclasses ?? []), emptySubclass() as SubclassData];
          set({ subclasses: subs });
          setEditingSubIdx(subs.length - 1);
        }} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}>
          + Add Subclass
        </button>
      }>
        {(value.subclasses ?? []).map((sub, i) => (
          <SubclassEditor
            key={i}
            sub={sub}
            open={editingSubIdx === i}
            onToggle={() => setEditingSubIdx(editingSubIdx === i ? null : i)}
            onChange={updated => {
              const subs = [...(value.subclasses ?? [])];
              subs[i] = updated;
              set({ subclasses: subs });
            }}
            onDelete={() => {
              set({ subclasses: (value.subclasses ?? []).filter((_, idx) => idx !== i) });
              if (editingSubIdx === i) setEditingSubIdx(null);
            }}
          />
        ))}
        {(value.subclasses ?? []).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--t-3)', fontStyle: 'italic' }}>No subclasses yet. Add one above.</div>
        )}
      </Section>

      {/* ── SHARING ── */}
      <Section title="Sharing">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 13, textTransform: 'none', letterSpacing: 0, marginBottom: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={(value as ClassEntry).is_public ?? false} onChange={e => set({ is_public: e.target.checked } as any)} />
          Make this class public (visible to all DNDKeep users)
        </label>
      </Section>

      {/* ── ACTIONS ── */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
        <button onClick={onSave} disabled={saving || !value.name?.trim()} className="btn-gold">
          {saving ? 'Saving…' : 'Save Class'}
        </button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        {saveMsg && <span style={{ fontSize: 12, color: '#34d399', alignSelf: 'center' }}>{saveMsg}</span>}
      </div>
    </div>
  );
}

// ── Subclass Editor ───────────────────────────────────────────────────────────
function SubclassEditor({ sub, open, onToggle, onChange, onDelete }: {
  sub: SubclassData; open: boolean;
  onToggle: () => void; onChange: (s: SubclassData) => void; onDelete: () => void;
}) {
  const set = (patch: Partial<SubclassData>) => onChange({ ...sub, ...patch });

  function addFeature() {
    onChange({ ...sub, features: [...(sub.features ?? []), emptyFeature()] });
  }

  function updateFeature(i: number, f: SubclassFeature) {
    const feats = [...(sub.features ?? [])];
    feats[i] = f;
    onChange({ ...sub, features: feats });
  }

  function deleteFeature(i: number) {
    onChange({ ...sub, features: (sub.features ?? []).filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--c-raised)', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-1)', flex: 1 }}>
          {sub.name || <span style={{ color: 'var(--t-3)', fontStyle: 'italic' }}>Unnamed subclass</span>}
        </span>
        <span style={{ fontSize: 10, color: 'var(--t-3)' }}>Lv {sub.unlock_level} · {(sub.features ?? []).length} feature{(sub.features ?? []).length !== 1 ? 's' : ''}</span>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ fontSize: 9, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Remove</button>
        <span style={{ fontSize: 10, color: 'var(--t-3)', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>

      {open && (
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <Field label="Subclass Name *">
              <input value={sub.name} onChange={e => set({ name: e.target.value })} placeholder="Path of the Shadow" />
            </Field>
            <Field label="Unlock Level">
              <input type="number" min={1} max={20} value={sub.unlock_level} onChange={e => set({ unlock_level: Number(e.target.value) })} style={{ width: 60 }} />
            </Field>
          </div>
          <Field label="Description (overview for players)">
            <textarea value={sub.description} onChange={e => set({ description: e.target.value })} rows={2} placeholder="Masters of shadow who..." />
          </Field>
          <Field label="Bonus Spell List (comma separated, optional)">
            <input value={(sub.spell_list ?? []).join(', ')} onChange={e => set({ spell_list: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="Darkness, Pass without Trace, Shadow Blade" />
          </Field>

          {/* Features */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>
                Features ({(sub.features ?? []).length})
              </span>
              <button onClick={addFeature} style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-2)' }}>
                + Feature
              </button>
            </div>
            {(sub.features ?? []).map((f, i) => (
              <FeatureEditor key={i} feature={f} onChange={updated => updateFeature(i, updated)} onDelete={() => deleteFeature(i)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feature Editor ────────────────────────────────────────────────────────────
function FeatureEditor({ feature, onChange, onDelete }: {
  feature: SubclassFeature; onChange: (f: SubclassFeature) => void; onDelete: () => void;
}) {
  const set = (patch: Partial<SubclassFeature>) => onChange({ ...feature, ...patch });
  const [open, setOpen] = useState(true);

  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.15)', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 12, color: 'var(--c-gold-l)', minWidth: 24 }}>Lv {feature.level}</span>
        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--t-1)', flex: 1 }}>{feature.name || <span style={{ color: 'var(--t-3)', fontStyle: 'italic' }}>Unnamed feature</span>}</span>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ fontSize: 9, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        <span style={{ fontSize: 9, color: 'var(--t-3)', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <Field label="Feature Name *">
              <input value={feature.name} onChange={e => set({ name: e.target.value })} placeholder="Shadow Step" />
            </Field>
            <Field label="Level">
              <input type="number" min={1} max={20} value={feature.level} onChange={e => set({ level: Number(e.target.value) })} style={{ width: 55 }} />
            </Field>
          </div>
          <Field label="Description (rules text)">
            <textarea value={feature.description} onChange={e => set({ description: e.target.value })} rows={3} placeholder="You can teleport up to 60 feet to an unoccupied space you can see that is in dim light or darkness..." />
          </Field>
          {/* Mechanics (optional) */}
          <div style={{ padding: '8px 10px', background: 'var(--c-raised)', borderRadius: 6, borderLeft: '2px solid rgba(96,165,250,0.4)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#60a5fa', marginBottom: 6 }}>
              Automation (optional) — drives dice roller and combat tracking
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Dice Expression">
                <input value={feature.mechanics?.[0]?.dice ?? ''} onChange={e => set({ mechanics: [{ ...(feature.mechanics?.[0] ?? { type: 'bonus', details: '' }), dice: e.target.value }] })} placeholder="2d6, 1d8+3, Xd6" />
              </Field>
              <Field label="Type">
                <select value={feature.mechanics?.[0]?.type ?? 'bonus'} onChange={e => set({ mechanics: [{ ...(feature.mechanics?.[0] ?? { details: '' }), type: e.target.value as any }] })}>
                  <option value="bonus">Bonus damage/healing</option>
                  <option value="resource">Resource (uses per rest)</option>
                  <option value="reaction">Reaction</option>
                  <option value="passive">Passive</option>
                  <option value="spell_list">Spell list addition</option>
                </select>
              </Field>
              <Field label="Details">
                <input value={feature.mechanics?.[0]?.details ?? ''} onChange={e => set({ mechanics: [{ ...(feature.mechanics?.[0] ?? { type: 'bonus' }), details: e.target.value }] })} placeholder="Extra Force damage on hit" />
              </Field>
              <Field label="Key Ability">
                <select value={feature.mechanics?.[0]?.ability ?? ''} onChange={e => set({ mechanics: [{ ...(feature.mechanics?.[0] ?? { type: 'bonus', details: '' }), ability: e.target.value }] })}>
                  <option value="">None</option>
                  {ABILITIES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-2)' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-3)', textTransform: 'none', letterSpacing: 0, marginBottom: 0 }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ active, onClick, label, small }: { active: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize: small ? 9 : 10, fontWeight: active ? 700 : 400, padding: small ? '2px 6px' : '3px 9px',
      borderRadius: 999, cursor: 'pointer', minHeight: 0,
      border: `1px solid ${active ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`,
      background: active ? 'var(--c-gold-bg)' : 'transparent',
      color: active ? 'var(--c-gold-l)' : 'var(--t-3)',
    }}>{label}</button>
  );
}
