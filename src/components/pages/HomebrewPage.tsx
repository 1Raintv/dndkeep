import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import ProGate from '../shared/ProGate';

type HomebrewTab = 'spells' | 'monsters' | 'items';

interface HomebrewSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string[];
  concentration: boolean;
  ritual: boolean;
  is_public: boolean;
}

interface HomebrewMonster {
  id: string;
  name: string;
  type: string;
  cr: string;
  size: string;
  hp: number;
  ac: number;
  speed: number;
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
  attack_name: string;
  attack_bonus: number;
  attack_damage: string;
  xp: number;
  traits: string;
  is_public: boolean;
}

interface HomebrewItem {
  id: string;
  name: string;
  item_type: string;
  rarity: string;
  requires_attunement: boolean;
  description: string;
  weight: number;
  is_public: boolean;
}

const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const CLASSES = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary'];
const ITEM_TYPES = ['armor', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'weapon', 'wondrous'];
const MONSTER_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'];
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const CRS = ['0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

function emptySpell(): Partial<HomebrewSpell> {
  return { name: '', level: 0, school: 'Evocation', casting_time: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', description: '', classes: [], concentration: false, ritual: false, is_public: false };
}
function emptyMonster(): Partial<HomebrewMonster> {
  return { name: '', type: 'Humanoid', cr: '1', size: 'Medium', hp: 10, ac: 12, speed: 30, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, attack_name: 'Strike', attack_bonus: 3, attack_damage: '1d6', xp: 200, traits: '', is_public: false };
}
function emptyItem(): Partial<HomebrewItem> {
  return { name: '', item_type: 'wondrous', rarity: 'uncommon', requires_attunement: false, description: '', weight: 0, is_public: false };
}

export default function HomebrewPage() {
  const { user, isPro } = useAuth();
  const [tab, setTab] = useState<HomebrewTab>('spells');
  const [spells, setSpells] = useState<HomebrewSpell[]>([]);
  const [monsters, setMonsters] = useState<HomebrewMonster[]>([]);
  const [items, setItems] = useState<HomebrewItem[]>([]);
  const [editing, setEditing] = useState<'spell' | 'monster' | 'item' | null>(null);
  const [spellForm, setSpellForm] = useState<Partial<HomebrewSpell>>(emptySpell());
  const [monsterForm, setMonsterForm] = useState<Partial<HomebrewMonster>>(emptyMonster());
  const [itemForm, setItemForm] = useState<Partial<HomebrewItem>>(emptyItem());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user) loadAll(); }, [user]);

  async function loadAll() {
    const [{ data: s }, { data: m }, { data: i }] = await Promise.all([
      supabase.from('homebrew_spells').select('*').eq('user_id', user!.id).order('name'),
      supabase.from('homebrew_monsters').select('*').eq('user_id', user!.id).order('name'),
      supabase.from('homebrew_items').select('*').eq('user_id', user!.id).order('name'),
    ]);
    if (s) setSpells(s as HomebrewSpell[]);
    if (m) setMonsters(m as HomebrewMonster[]);
    if (i) setItems(i as HomebrewItem[]);
  }

  async function saveSpell() {
    if (!spellForm.name?.trim() || !user) return;
    setSaving(true);
    if ((spellForm as HomebrewSpell).id) {
      await supabase.from('homebrew_spells').update({ ...spellForm }).eq('id', (spellForm as HomebrewSpell).id);
    } else {
      await supabase.from('homebrew_spells').insert({ ...spellForm, user_id: user.id });
    }
    await loadAll();
    setSaving(false);
    setEditing(null);
    setSpellForm(emptySpell());
  }

  async function saveMonster() {
    if (!monsterForm.name?.trim() || !user) return;
    setSaving(true);
    if ((monsterForm as HomebrewMonster).id) {
      await supabase.from('homebrew_monsters').update({ ...monsterForm }).eq('id', (monsterForm as HomebrewMonster).id);
    } else {
      await supabase.from('homebrew_monsters').insert({ ...monsterForm, user_id: user.id });
    }
    await loadAll();
    setSaving(false);
    setEditing(null);
    setMonsterForm(emptyMonster());
  }

  async function saveItem() {
    if (!itemForm.name?.trim() || !user) return;
    setSaving(true);
    if ((itemForm as HomebrewItem).id) {
      await supabase.from('homebrew_items').update({ ...itemForm }).eq('id', (itemForm as HomebrewItem).id);
    } else {
      await supabase.from('homebrew_items').insert({ ...itemForm, user_id: user.id });
    }
    await loadAll();
    setSaving(false);
    setEditing(null);
    setItemForm(emptyItem());
  }

  async function deleteSpell(id: string) {
    await supabase.from('homebrew_spells').delete().eq('id', id);
    setSpells(prev => prev.filter(s => s.id !== id));
  }
  async function deleteMonster(id: string) {
    await supabase.from('homebrew_monsters').delete().eq('id', id);
    setMonsters(prev => prev.filter(m => m.id !== id));
  }
  async function deleteItem(id: string) {
    await supabase.from('homebrew_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  const labelStyle = { display: 'block', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 'var(--sp-1)', background: 'none', WebkitTextFillColor: 'var(--t-2)' };
  const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 style={{ marginBottom: 'var(--sp-2)' }}>Homebrew Creator</h1>
        <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
          Create custom spells, monsters, and magic items for your campaigns.
        </p>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--sp-6)' }}>
        {(['spells', 'monsters', 'items'] as const).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'spells' ? '✨ Spells' : t === 'monsters' ? '👹 Monsters' : '⚗️ Items'}
            <span style={{ marginLeft: 6, fontFamily: 'var(--ff-body)', fontSize: 9, opacity: 0.7 }}>
              ({t === 'spells' ? spells.length : t === 'monsters' ? monsters.length : items.length})
            </span>
          </button>
        ))}
      </div>

      {/* ── SPELLS ── */}
      {tab === 'spells' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-4)' }}>
            <button className="btn-gold" onClick={() => { setSpellForm(emptySpell()); setEditing('spell'); }}>
              + New Spell
            </button>
          </div>
          {spells.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>No homebrew spells yet.</div>
          ) : spells.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: 'var(--sp-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{s.name}</div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {s.level === 0 ? 'Cantrip' : `Level ${s.level}`} · {s.school} · {s.casting_time}
                  {s.is_public && <span style={{ marginLeft: 6, color: 'var(--hp-full)' }}>Public</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn-secondary btn-sm" onClick={() => { setSpellForm(s); setEditing('spell'); }}>Edit</button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--c-red-l)' }} onClick={() => deleteSpell(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MONSTERS ── */}
      {tab === 'monsters' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-4)' }}>
            <button className="btn-gold" onClick={() => { setMonsterForm(emptyMonster()); setEditing('monster'); }}>+ New Monster</button>
          </div>
          {monsters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>No homebrew monsters yet.</div>
          ) : monsters.map(m => (
            <div key={m.id} className="card" style={{ marginBottom: 'var(--sp-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{m.name}</div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>CR {m.cr} · {m.size} {m.type} · {m.hp} HP · AC {m.ac}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn-secondary btn-sm" onClick={() => { setMonsterForm(m); setEditing('monster'); }}>Edit</button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--c-red-l)' }} onClick={() => deleteMonster(m.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ITEMS ── */}
      {tab === 'items' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-4)' }}>
            <button className="btn-gold" onClick={() => { setItemForm(emptyItem()); setEditing('item'); }}>+ New Item</button>
          </div>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>No homebrew items yet.</div>
          ) : items.map(i => (
            <div key={i.id} className="card" style={{ marginBottom: 'var(--sp-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{i.name}</div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {i.rarity} · {i.item_type}{i.requires_attunement ? ' · Attunement' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn-secondary btn-sm" onClick={() => { setItemForm(i); setEditing('item'); }}>Edit</button>
                <button className="btn-ghost btn-sm" style={{ color: 'var(--c-red-l)' }} onClick={() => deleteItem(i.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SPELL FORM MODAL ── */}
      {editing === 'spell' && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>{(spellForm as HomebrewSpell).id ? 'Edit' : 'New'} Homebrew Spell</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div><label style={labelStyle}>Name *</label><input value={spellForm.name ?? ''} onChange={e => setSpellForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div style={gridStyle}>
                <div><label style={labelStyle}>Level</label>
                  <select value={spellForm.level ?? 0} onChange={e => setSpellForm(f => ({ ...f, level: +e.target.value }))}>
                    <option value={0}>Cantrip</option>
                    {[1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>School</label>
                  <select value={spellForm.school ?? 'Evocation'} onChange={e => setSpellForm(f => ({ ...f, school: e.target.value }))}>
                    {SCHOOLS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Casting Time</label><input value={spellForm.casting_time ?? ''} onChange={e => setSpellForm(f => ({ ...f, casting_time: e.target.value }))} placeholder="1 action" /></div>
                <div><label style={labelStyle}>Range</label><input value={spellForm.range ?? ''} onChange={e => setSpellForm(f => ({ ...f, range: e.target.value }))} placeholder="60 feet" /></div>
                <div><label style={labelStyle}>Components</label><input value={spellForm.components ?? ''} onChange={e => setSpellForm(f => ({ ...f, components: e.target.value }))} placeholder="V, S, M (a pinch of...)" /></div>
                <div><label style={labelStyle}>Duration</label><input value={spellForm.duration ?? ''} onChange={e => setSpellForm(f => ({ ...f, duration: e.target.value }))} placeholder="Instantaneous" /></div>
              </div>
              <div>
                <label style={labelStyle}>Available to Classes</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CLASSES.map(c => {
                    const selected = (spellForm.classes ?? []).includes(c);
                    return (
                      <button key={c} onClick={() => setSpellForm(f => ({ ...f, classes: selected ? (f.classes ?? []).filter(x => x !== c) : [...(f.classes ?? []), c] }))}
                        style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 4, border: selected ? '1px solid #a78bfa' : '1px solid var(--c-border)', background: selected ? 'rgba(167,139,250,0.15)' : 'transparent', color: selected ? '#a78bfa' : 'var(--t-2)', cursor: 'pointer' }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  <input type="checkbox" checked={!!spellForm.concentration} onChange={e => setSpellForm(f => ({ ...f, concentration: e.target.checked }))} /> Concentration
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  <input type="checkbox" checked={!!spellForm.ritual} onChange={e => setSpellForm(f => ({ ...f, ritual: e.target.checked }))} /> Ritual
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--hp-full)' }}>
                  <input type="checkbox" checked={!!spellForm.is_public} onChange={e => setSpellForm(f => ({ ...f, is_public: e.target.checked }))} /> Public
                </label>
              </div>
              <div><label style={labelStyle}>Description *</label><textarea value={spellForm.description ?? ''} onChange={e => setSpellForm(f => ({ ...f, description: e.target.value }))} rows={5} placeholder="Spell effect, saving throw, damage..." /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-gold" onClick={saveSpell} disabled={saving || !spellForm.name?.trim()}>{saving ? 'Saving…' : 'Save Spell'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MONSTER FORM MODAL ── */}
      {editing === 'monster' && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>{(monsterForm as HomebrewMonster).id ? 'Edit' : 'New'} Homebrew Monster</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div><label style={labelStyle}>Name *</label><input value={monsterForm.name ?? ''} onChange={e => setMonsterForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div style={gridStyle}>
                <div><label style={labelStyle}>Type</label><select value={monsterForm.type ?? 'Humanoid'} onChange={e => setMonsterForm(f => ({ ...f, type: e.target.value }))}>{MONSTER_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={labelStyle}>Size</label><select value={monsterForm.size ?? 'Medium'} onChange={e => setMonsterForm(f => ({ ...f, size: e.target.value }))}>{SIZES.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label style={labelStyle}>CR</label><select value={monsterForm.cr ?? '1'} onChange={e => setMonsterForm(f => ({ ...f, cr: e.target.value }))}>{CRS.map(c => <option key={c} value={c}>CR {c}</option>)}</select></div>
                <div><label style={labelStyle}>XP</label><input type="number" value={monsterForm.xp ?? 200} onChange={e => setMonsterForm(f => ({ ...f, xp: +e.target.value }))} /></div>
                <div><label style={labelStyle}>HP</label><input type="number" value={monsterForm.hp ?? 10} onChange={e => setMonsterForm(f => ({ ...f, hp: +e.target.value }))} /></div>
                <div><label style={labelStyle}>AC</label><input type="number" value={monsterForm.ac ?? 12} onChange={e => setMonsterForm(f => ({ ...f, ac: +e.target.value }))} /></div>
                <div><label style={labelStyle}>Speed (ft)</label><input type="number" value={monsterForm.speed ?? 30} onChange={e => setMonsterForm(f => ({ ...f, speed: +e.target.value }))} /></div>
              </div>
              <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {(['str','dex','con','int','wis','cha'] as const).map(ab => (
                  <div key={ab}><label style={labelStyle}>{ab.toUpperCase()}</label><input type="number" value={(monsterForm as any)[ab] ?? 10} onChange={e => setMonsterForm(f => ({ ...f, [ab]: +e.target.value }))} /></div>
                ))}
              </div>
              <div style={gridStyle}>
                <div><label style={labelStyle}>Attack Name</label><input value={monsterForm.attack_name ?? ''} onChange={e => setMonsterForm(f => ({ ...f, attack_name: e.target.value }))} placeholder="Bite, Claw..." /></div>
                <div><label style={labelStyle}>Attack Bonus</label><input type="number" value={monsterForm.attack_bonus ?? 3} onChange={e => setMonsterForm(f => ({ ...f, attack_bonus: +e.target.value }))} /></div>
                <div><label style={labelStyle}>Damage</label><input value={monsterForm.attack_damage ?? ''} onChange={e => setMonsterForm(f => ({ ...f, attack_damage: e.target.value }))} placeholder="2d6+3" /></div>
              </div>
              <div><label style={labelStyle}>Special Traits (optional)</label><textarea value={monsterForm.traits ?? ''} onChange={e => setMonsterForm(f => ({ ...f, traits: e.target.value }))} rows={3} placeholder="Darkvision 60 ft. Pack Tactics..." /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--hp-full)' }}>
                <input type="checkbox" checked={!!monsterForm.is_public} onChange={e => setMonsterForm(f => ({ ...f, is_public: e.target.checked }))} /> Make public (others can see in Monster Browser)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-gold" onClick={saveMonster} disabled={saving || !monsterForm.name?.trim()}>{saving ? 'Saving…' : 'Save Monster'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ITEM FORM MODAL ── */}
      {editing === 'item' && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>{(itemForm as HomebrewItem).id ? 'Edit' : 'New'} Homebrew Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div><label style={labelStyle}>Name *</label><input value={itemForm.name ?? ''} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div style={gridStyle}>
                <div><label style={labelStyle}>Type</label><select value={itemForm.item_type ?? 'wondrous'} onChange={e => setItemForm(f => ({ ...f, item_type: e.target.value }))}>{ITEM_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={labelStyle}>Rarity</label><select value={itemForm.rarity ?? 'uncommon'} onChange={e => setItemForm(f => ({ ...f, rarity: e.target.value }))}>{RARITIES.map(r => <option key={r}>{r}</option>)}</select></div>
                <div><label style={labelStyle}>Weight (lb)</label><input type="number" value={itemForm.weight ?? 0} step="0.5" onChange={e => setItemForm(f => ({ ...f, weight: +e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  <input type="checkbox" checked={!!itemForm.requires_attunement} onChange={e => setItemForm(f => ({ ...f, requires_attunement: e.target.checked }))} /> Requires Attunement
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--hp-full)' }}>
                  <input type="checkbox" checked={!!itemForm.is_public} onChange={e => setItemForm(f => ({ ...f, is_public: e.target.checked }))} /> Public
                </label>
              </div>
              <div><label style={labelStyle}>Description *</label><textarea value={itemForm.description ?? ''} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} rows={5} placeholder="While attuned to this item..." /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-gold" onClick={saveItem} disabled={saving || !itemForm.name?.trim()}>{saving ? 'Saving…' : 'Save Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
