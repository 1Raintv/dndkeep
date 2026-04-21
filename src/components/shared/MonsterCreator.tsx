// v2.94.0 — Phase B of the Combat Backbone
//
// Homebrew Monster Creator. Lets a DM build custom monsters that live in the
// same `monsters` table as the SRD 334, tagged with owner_id + source='homebrew'
// + license_key='homebrew' + is_editable=true.
//
// RLS policy `monsters_insert_own_homebrew` enforces source='homebrew' AND
// owner_id=auth.uid() on INSERT.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { invalidateMonstersCache } from '../../lib/hooks/useMonsters';
import type { MonsterData, MonsterAction, MonsterTrait, MonsterLegendaryAction, CreatureSize } from '../../types';

const SIZES: CreatureSize[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];
const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned', 'Any'];
const CR_OPTIONS = ['0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'];
const CR_XP_TABLE: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

type HomebrewMonsterInput = Partial<MonsterData>;

function emptyMonster(): HomebrewMonsterInput {
  return {
    name: '',
    type: 'Beast',
    size: 'Medium',
    alignment: 'Unaligned',
    cr: '1',
    xp: 200,
    hp: 10,
    hp_formula: '2d8+2',
    ac: 12,
    speed: 30,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    proficiency_bonus: 2,
    languages: '',
    traits: [],
    actions: [],
    reactions: [],
    legendary_actions: [],
    // Legacy single-attack compat
    attack_name: 'Attack',
    attack_bonus: 3,
    attack_damage: '1d6+1',
  };
}

interface Props {
  initial?: MonsterData | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function MonsterCreator({ initial, onSaved, onCancel }: Props) {
  const [m, setM] = useState<HomebrewMonsterInput>(initial ?? emptyMonster());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function patch(p: Partial<HomebrewMonsterInput>) {
    setM(prev => ({ ...prev, ...p }));
  }

  function onCrChange(v: string) {
    patch({ cr: v, xp: CR_XP_TABLE[v] ?? 0 });
  }

  async function save() {
    setError('');
    if (!m.name?.trim()) { setError('Name is required'); return; }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not signed in'); setSaving(false); return; }

    const row: Record<string, unknown> = {
      name: m.name!.trim(),
      type: m.type ?? 'Beast',
      subtype: m.subtype ?? null,
      alignment: m.alignment ?? null,
      cr: String(m.cr ?? '1'),
      xp: m.xp ?? 0,
      size: m.size ?? 'Medium',
      hp: m.hp ?? 10,
      hp_formula: m.hp_formula ?? '',
      ac: m.ac ?? 10,
      ac_note: m.ac_note ?? null,
      speed: m.speed ?? 30,
      fly_speed: m.fly_speed ?? null,
      swim_speed: m.swim_speed ?? null,
      climb_speed: m.climb_speed ?? null,
      burrow_speed: m.burrow_speed ?? null,
      str: m.str ?? 10, dex: m.dex ?? 10, con: m.con ?? 10,
      int: m.int ?? 10, wis: m.wis ?? 10, cha: m.cha ?? 10,
      saving_throws: m.saving_throws ?? null,
      skills: m.skills ?? null,
      damage_immunities: m.damage_immunities ?? null,
      damage_resistances: m.damage_resistances ?? null,
      damage_vulnerabilities: m.damage_vulnerabilities ?? null,
      condition_immunities: m.condition_immunities ?? null,
      senses: m.senses ?? null,
      languages: m.languages ?? null,
      proficiency_bonus: m.proficiency_bonus ?? 2,
      traits: m.traits ?? [],
      actions: m.actions ?? [],
      reactions: m.reactions ?? [],
      legendary_actions: m.legendary_actions ?? [],
      legendary_resistance_count: m.legendary_resistance_count ?? null,
      attack_name: m.attack_name ?? 'Attack',
      attack_bonus: m.attack_bonus ?? 0,
      attack_damage: m.attack_damage ?? '',
      // Phase B metadata
      source: 'homebrew',
      owner_id: user.id,
      visibility: 'private',
      license_key: 'homebrew',
      attribution_text: 'Homebrew — created by a DNDKeep user.',
      ruleset_version: '2024',
      is_editable: true,
    };

    let result;
    if (initial?.id && (initial.license_key === 'homebrew' || initial.source === 'homebrew')) {
      // Editing existing homebrew — UPDATE
      result = await supabase.from('monsters').update(row).eq('id', initial.id);
    } else {
      // New homebrew — INSERT (id is a text column per the schema; generate one)
      const id = `hb-${crypto.randomUUID()}`;
      result = await supabase.from('monsters').insert({ id, ...row });
    }

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    invalidateMonstersCache();
    onSaved();
  }

  // ── Trait / Action / Reaction array editors ──────────────────────────────
  function addTrait() {
    patch({ traits: [...(m.traits ?? []), { name: '', desc: '' }] });
  }
  function updateTrait(i: number, p: Partial<MonsterTrait>) {
    const arr = [...(m.traits ?? [])];
    arr[i] = { ...arr[i], ...p };
    patch({ traits: arr });
  }
  function removeTrait(i: number) {
    patch({ traits: (m.traits ?? []).filter((_, idx) => idx !== i) });
  }

  function addAction() {
    patch({ actions: [...(m.actions ?? []), { name: '', desc: '' }] });
  }
  function updateAction(i: number, p: Partial<MonsterAction>) {
    const arr = [...(m.actions ?? [])];
    arr[i] = { ...arr[i], ...p };
    patch({ actions: arr });
  }
  function removeAction(i: number) {
    patch({ actions: (m.actions ?? []).filter((_, idx) => idx !== i) });
  }

  function addReaction() {
    patch({ reactions: [...(m.reactions ?? []), { name: '', desc: '' }] });
  }
  function updateReaction(i: number, p: Partial<MonsterTrait>) {
    const arr = [...(m.reactions ?? [])];
    arr[i] = { ...arr[i], ...p };
    patch({ reactions: arr });
  }
  function removeReaction(i: number) {
    patch({ reactions: (m.reactions ?? []).filter((_, idx) => idx !== i) });
  }

  function addLegendary() {
    patch({ legendary_actions: [...(m.legendary_actions ?? []), { name: '', desc: '' }] });
  }
  function updateLegendary(i: number, p: Partial<MonsterLegendaryAction>) {
    const arr = [...(m.legendary_actions ?? [])];
    arr[i] = { ...arr[i], ...p };
    patch({ legendary_actions: arr });
  }
  function removeLegendary(i: number) {
    patch({ legendary_actions: (m.legendary_actions ?? []).filter((_, idx) => idx !== i) });
  }

  const fieldStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 13, minHeight: 0,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--t-3)', marginBottom: 3,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{initial?.id ? 'Edit Homebrew Monster' : 'Create Homebrew Monster'}</h3>
          <p style={{ fontSize: 12, color: 'var(--t-3)', margin: '4px 0 0' }}>
            Your homebrew is private by default. Only you see it until you choose to share it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ ...fieldStyle, padding: '6px 14px' }}>Cancel</button>
          <button className="btn-gold" onClick={save} disabled={saving} style={{ ...fieldStyle, padding: '6px 14px' }}>
            {saving ? 'Saving…' : (initial?.id ? 'Save Changes' : 'Create Monster')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)',
          color: '#f87171', fontSize: 12, fontFamily: 'var(--ff-body)',
        }}>{error}</div>
      )}

      {/* Identity */}
      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
        <div>
          <div style={labelStyle}>Name</div>
          <input style={{ ...fieldStyle, width: '100%' }} value={m.name ?? ''} onChange={e => patch({ name: e.target.value })} placeholder="Shadowfang Hound" />
        </div>
        <div>
          <div style={labelStyle}>Size</div>
          <select style={{ ...fieldStyle, width: '100%' }} value={m.size} onChange={e => patch({ size: e.target.value as CreatureSize })}>
            {SIZES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Type</div>
          <select style={{ ...fieldStyle, width: '100%' }} value={m.type} onChange={e => patch({ type: e.target.value })}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Alignment</div>
          <select style={{ ...fieldStyle, width: '100%' }} value={m.alignment ?? 'Unaligned'} onChange={e => patch({ alignment: e.target.value })}>
            {ALIGNMENTS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </section>

      {/* Core stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <div>
          <div style={labelStyle}>CR</div>
          <select style={{ ...fieldStyle, width: '100%' }} value={String(m.cr)} onChange={e => onCrChange(e.target.value)}>
            {CR_OPTIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>XP</div>
          <input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.xp ?? 0} onChange={e => patch({ xp: Number(e.target.value) })} />
        </div>
        <div>
          <div style={labelStyle}>Proficiency</div>
          <input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.proficiency_bonus ?? 2} onChange={e => patch({ proficiency_bonus: Number(e.target.value) })} />
        </div>
        <div>
          <div style={labelStyle}>AC</div>
          <input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.ac ?? 10} onChange={e => patch({ ac: Number(e.target.value) })} />
        </div>
        <div>
          <div style={labelStyle}>HP</div>
          <input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.hp ?? 10} onChange={e => patch({ hp: Number(e.target.value) })} />
        </div>
        <div>
          <div style={labelStyle}>HP Formula</div>
          <input style={{ ...fieldStyle, width: '100%' }} value={m.hp_formula ?? ''} onChange={e => patch({ hp_formula: e.target.value })} placeholder="2d8+2" />
        </div>
      </section>

      {/* Speeds */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div><div style={labelStyle}>Speed ft.</div><input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.speed ?? 30} onChange={e => patch({ speed: Number(e.target.value) })} /></div>
        <div><div style={labelStyle}>Fly</div><input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.fly_speed ?? 0} onChange={e => patch({ fly_speed: Number(e.target.value) || undefined })} /></div>
        <div><div style={labelStyle}>Swim</div><input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.swim_speed ?? 0} onChange={e => patch({ swim_speed: Number(e.target.value) || undefined })} /></div>
        <div><div style={labelStyle}>Climb</div><input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.climb_speed ?? 0} onChange={e => patch({ climb_speed: Number(e.target.value) || undefined })} /></div>
        <div><div style={labelStyle}>Burrow</div><input type="number" style={{ ...fieldStyle, width: '100%' }} value={m.burrow_speed ?? 0} onChange={e => patch({ burrow_speed: Number(e.target.value) || undefined })} /></div>
      </section>

      {/* Ability scores */}
      <section>
        <div style={labelStyle}>Ability Scores</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ab => (
            <div key={ab}>
              <div style={{ ...labelStyle, marginBottom: 2, fontSize: 9 }}>{ab.toUpperCase()}</div>
              <input type="number" style={{ ...fieldStyle, width: '100%' }} value={m[ab] ?? 10} onChange={e => patch({ [ab]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </section>

      {/* Languages */}
      <section>
        <div style={labelStyle}>Languages</div>
        <input style={{ ...fieldStyle, width: '100%' }} value={m.languages ?? ''} onChange={e => patch({ languages: e.target.value })} placeholder="Common, Draconic; telepathy 60 ft." />
      </section>

      {/* Traits */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={labelStyle}>Traits</div>
          <button onClick={addTrait} style={{ ...fieldStyle, padding: '3px 10px' }}>+ Add Trait</button>
        </div>
        {(m.traits ?? []).length === 0 && <div style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>No traits yet. Traits are passive abilities like Amphibious, Pack Tactics, etc.</div>}
        {(m.traits ?? []).map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 8, marginBottom: 6 }}>
            <input style={fieldStyle} value={t.name} onChange={e => updateTrait(i, { name: e.target.value })} placeholder="Trait name" />
            <input style={fieldStyle} value={t.desc} onChange={e => updateTrait(i, { desc: e.target.value })} placeholder="Description" />
            <button onClick={() => removeTrait(i)} style={{ ...fieldStyle, padding: '3px 10px', color: '#f87171' }}>Remove</button>
          </div>
        ))}
      </section>

      {/* Actions */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={labelStyle}>Actions</div>
          <button onClick={addAction} style={{ ...fieldStyle, padding: '3px 10px' }}>+ Add Action</button>
        </div>
        {(m.actions ?? []).length === 0 && <div style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>Add attacks and special abilities here.</div>}
        {(m.actions ?? []).map((a, i) => (
          <div key={i} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--c-border)', background: '#080d14', marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 6 }}>
              <input style={fieldStyle} value={a.name} onChange={e => updateAction(i, { name: e.target.value })} placeholder="Attack name (e.g., Bite, Fire Breath)" />
              <button onClick={() => removeAction(i)} style={{ ...fieldStyle, padding: '3px 10px', color: '#f87171' }}>Remove</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 6 }}>
              <input type="number" style={fieldStyle} value={a.attack_bonus ?? ''} onChange={e => updateAction(i, { attack_bonus: e.target.value ? Number(e.target.value) : undefined })} placeholder="+X to hit" />
              <input style={fieldStyle} value={a.damage_dice ?? ''} onChange={e => updateAction(i, { damage_dice: e.target.value || undefined })} placeholder="Damage (1d8+3)" />
              <input style={fieldStyle} value={a.damage_type ?? ''} onChange={e => updateAction(i, { damage_type: e.target.value || undefined })} placeholder="Piercing / Fire / ..." />
              <input style={fieldStyle} value={a.usage ?? ''} onChange={e => updateAction(i, { usage: e.target.value || undefined })} placeholder="Recharge / Per day" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 80px auto', gap: 8, marginBottom: 6 }}>
              <input style={fieldStyle} value={a.dc_type ?? ''} onChange={e => updateAction(i, { dc_type: e.target.value || undefined })} placeholder="Save type (DEX / WIS / ...)" />
              <input type="number" style={fieldStyle} value={a.dc_value ?? ''} onChange={e => updateAction(i, { dc_value: e.target.value ? Number(e.target.value) : undefined })} placeholder="DC" />
              <input style={fieldStyle} value={a.dc_success ?? ''} onChange={e => updateAction(i, { dc_success: e.target.value || undefined })} placeholder="half / none on success" />
            </div>
            <textarea style={{ ...fieldStyle, width: '100%', minHeight: 60, resize: 'vertical' }} value={a.desc} onChange={e => updateAction(i, { desc: e.target.value })} placeholder="Full description of the action" />
          </div>
        ))}
      </section>

      {/* Reactions */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={labelStyle}>Reactions</div>
          <button onClick={addReaction} style={{ ...fieldStyle, padding: '3px 10px' }}>+ Add Reaction</button>
        </div>
        {(m.reactions ?? []).map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 8, marginBottom: 6 }}>
            <input style={fieldStyle} value={r.name} onChange={e => updateReaction(i, { name: e.target.value })} placeholder="Reaction name" />
            <input style={fieldStyle} value={r.desc} onChange={e => updateReaction(i, { desc: e.target.value })} placeholder="Description" />
            <button onClick={() => removeReaction(i)} style={{ ...fieldStyle, padding: '3px 10px', color: '#f87171' }}>Remove</button>
          </div>
        ))}
      </section>

      {/* Legendary Actions */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={labelStyle}>Legendary Actions</div>
          <button onClick={addLegendary} style={{ ...fieldStyle, padding: '3px 10px' }}>+ Add</button>
        </div>
        {(m.legendary_actions ?? []).map((la, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 60px 1fr auto', gap: 8, marginBottom: 6 }}>
            <input style={fieldStyle} value={la.name} onChange={e => updateLegendary(i, { name: e.target.value })} placeholder="Name" />
            <input type="number" style={fieldStyle} value={la.cost ?? 1} onChange={e => updateLegendary(i, { cost: Number(e.target.value) })} placeholder="Cost" />
            <input style={fieldStyle} value={la.desc} onChange={e => updateLegendary(i, { desc: e.target.value })} placeholder="Description" />
            <button onClick={() => removeLegendary(i)} style={{ ...fieldStyle, padding: '3px 10px', color: '#f87171' }}>Remove</button>
          </div>
        ))}
      </section>
    </div>
  );
}
