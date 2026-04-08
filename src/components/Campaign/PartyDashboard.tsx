import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Character } from '../../types';
import { CONDITIONS, CONDITION_MAP } from '../../data/conditions';
import { xpToLevel, xpForNextLevel, computeStats, abilityModifier, proficiencyBonus } from '../../lib/gameUtils';
import { SPELLS } from '../../data/spells';

interface PartyDashboardProps {
  campaignId: string;
  isOwner: boolean; // DM = true, player = false
}

function hpColor(current: number, max: number) {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.6) return 'var(--hp-full)';
  if (pct > 0.25) return 'var(--hp-mid)';
  if (pct > 0) return 'var(--hp-low)';
  return 'var(--hp-dead)';
}

function hpLabel(current: number, max: number) {
  const pct = max > 0 ? current / max : 0;
  if (pct >= 1) return { label: 'Full', color: 'var(--hp-full)' };
  if (pct > 0.75) return { label: 'Healthy', color: 'var(--hp-full)' };
  if (pct > 0.5) return { label: 'Injured', color: 'var(--hp-mid)' };
  if (pct > 0.25) return { label: 'Bloodied', color: '#f97316' };
  if (pct > 0) return { label: 'Critical', color: 'var(--hp-low)' };
  return { label: '☠ Downed', color: '#dc2626' };
}

export default function PartyDashboard({ campaignId, isOwner }: PartyDashboardProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [xpInput, setXpInput] = useState('');
  const [xpNote, setXpNote] = useState('');
  const [lootGold, setLootGold] = useState('');
  const [lootItem, setLootItem] = useState('');
  const [dmPanel, setDmPanel] = useState<'xp' | 'loot' | 'aoe' | 'rest' | 'announce' | 'save' | null>(null);
  // AoE
  const [aoeDamage, setAoeDamage] = useState('');
  const [aoeTargets, setAoeTargets] = useState<Set<string>>(new Set());
  const [aoeHalved, setAoeHalved] = useState(false);
  const [aoeApplied, setAoeApplied] = useState<{ name: string; took: number; concentration: boolean }[] | null>(null);
  // Passive perception
  const [perceptionDC, setPerceptionDC] = useState('');
  // Announce
  const [announceText, setAnnounceText] = useState('');
  // Save prompt
  const [saveAbility, setSaveAbility] = useState('Constitution');
  const [saveDC, setSaveDC] = useState('');

  useEffect(() => {
    loadCharacters();
    const channel = supabase
      .channel(`party-dashboard-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => loadCharacters())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function awardXP() {
    const amount = parseInt(xpInput);
    if (isNaN(amount) || amount <= 0 || characters.length === 0) return;
    const perPlayer = Math.floor(amount / characters.length);
    const remainder = amount % characters.length;
    await Promise.all(characters.map((c, i) => {
      const gain = perPlayer + (i < remainder ? 1 : 0);
      const newXP = (c.experience_points ?? 0) + gain;
      return supabase.from('characters').update({ experience_points: newXP }).eq('id', c.id);
    }));
    setXpInput('');
    setXpNote('');
  }

  async function distributeLoot() {
    const gold = parseInt(lootGold) || 0;
    const item = lootItem.trim();
    if (!gold && !item) return;

    const perPlayer = characters.length > 0 ? Math.floor(gold / characters.length) : 0;
    const remainder = gold % Math.max(characters.length, 1);

    await Promise.all(characters.map((c, i) => {
      const patch: Partial<Character> = {};
      // Distribute gold evenly (first players get +1 remainder GP)
      if (gold > 0) {
        const curr: any = { ...(c.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }) };
        curr.gp = (curr.gp ?? 0) + perPlayer + (i < remainder ? 1 : 0);
        patch.currency = curr;
      }
      // Give each player a copy of the item
      if (item) {
        const newItem = { id: `loot-${Date.now()}-${i}`, name: item, quantity: 1, weight: 0, description: '', equipped: false };
        patch.inventory = [...(c.inventory ?? []), newItem];
      }
      return Object.keys(patch).length
        ? supabase.from('characters').update(patch).eq('id', c.id)
        : Promise.resolve();
    }));
    setLootGold('');
    setLootItem('');
  }

  async function applyAoE() {
    const dmg = parseInt(aoeDamage);
    if (isNaN(dmg) || dmg <= 0 || aoeTargets.size === 0) return;
    const results: { name: string; took: number; concentration: boolean }[] = [];
    await Promise.all([...aoeTargets].map(id => {
      const c = characters.find(x => x.id === id);
      if (!c) return Promise.resolve();
      const actual = aoeHalved ? Math.floor(dmg / 2) : dmg;
      const newHP = Math.max(0, c.current_hp - actual);
      const concBreaks = !!(c.concentration_spell && actual > 0);
      results.push({ name: c.name, took: actual, concentration: concBreaks });
      const patch: Partial<Character> = { current_hp: newHP };
      if (concBreaks) patch.concentration_spell = '';
      return supabase.from('characters').update(patch).eq('id', id);
    }));
    setAoeApplied(results);
    setAoeDamage('');
    setAoeTargets(new Set());
    setAoeHalved(false);
  }

  async function partyLongRest() {
    await Promise.all(characters.map(c => {
      const recoveredSlots = Object.fromEntries(
        Object.entries(c.spell_slots ?? {}).map(([k, s]) => [k, { ...(s as object), used: 0 }])
      );
      const recoveredHD = Math.max(1, Math.floor(c.level / 2));
      const newSpent = Math.max(0, (c.hit_dice_spent ?? 0) - recoveredHD);
      // Remove Exhaustion from conditions
      const newConditions = (c.active_conditions ?? []).filter((x: string) => x !== 'Exhaustion');
      return supabase.from('characters').update({
        current_hp: c.max_hp,
        temp_hp: 0,
        spell_slots: recoveredSlots,
        active_conditions: newConditions,
        death_saves_successes: 0,
        death_saves_failures: 0,
        hit_dice_spent: newSpent,
        concentration_spell: '',
      }).eq('id', c.id);
    }));
    setDmPanel(null);
  }

  async function broadcastAnnouncement() {
    if (!announceText.trim()) return;
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      character_name: 'DM',
      message: announceText.trim(),
      message_type: 'announcement',
    });
    setAnnounceText('');
    setDmPanel(null);
  }

  async function broadcastSavePrompt() {
    const dc = parseInt(saveDC);
    if (isNaN(dc) || dc <= 0) return;
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      character_name: 'DM',
      message: JSON.stringify({ ability: saveAbility, dc }),
      message_type: 'save_prompt',
    });
    setSaveDC('');
    setDmPanel(null);
  }

  async function loadCharacters() {
    const { data: members } = await supabase.from('campaign_members').select('user_id').eq('campaign_id', campaignId);
    if (!members?.length) { setLoading(false); return; }
    const userIds = members.map((m: any) => m.user_id);
    const { data: chars } = await supabase.from('characters').select(
      'id,user_id,campaign_id,name,species,class_name,subclass,level,current_hp,max_hp,temp_hp,armor_class,speed,initiative_bonus,strength,dexterity,constitution,intelligence,wisdom,charisma,active_conditions,concentration_spell,inspiration,death_saves_successes,death_saves_failures,avatar_url,hit_dice_spent,spell_slots,prepared_spells,known_spells,saving_throw_proficiencies,skill_proficiencies,class_resources,weapons,wildshape_active,wildshape_beast_name,wildshape_current_hp,wildshape_max_hp,active_buffs'
    ).in('user_id', userIds).eq('campaign_id', campaignId);
    setCharacters(chars ?? []);
    setLoading(false);
  }

  async function updateChar(id: string, patch: Partial<Character>) {
    await supabase.from('characters').update(patch).eq('id', id);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)' }}>Loading party…</div>;

  if (characters.length === 0) return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
      <div style={{ fontSize: 'var(--fs-sm)' }}>No characters in this campaign yet. Players need to assign their characters to this campaign.</div>
    </div>
  );

  const totalHp = characters.reduce((s, c) => s + c.current_hp, 0);
  const totalMaxHp = characters.reduce((s, c) => s + c.max_hp, 0);
  const downedCount = characters.filter(c => c.current_hp <= 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Party summary */}
      <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)' }}>
        <SummaryChip label="Party" value={characters.length} color="var(--t-1)" />
        <SummaryChip label="Total HP" value={`${totalHp}/${totalMaxHp}`} color={hpColor(totalHp, totalMaxHp)} />
        {downedCount > 0 && <SummaryChip label="Downed" value={downedCount} color="#dc2626" />}
        <SummaryChip label="Conditions" value={characters.reduce((s, c) => s + (c.active_conditions?.length ?? 0), 0)} color={characters.some(c => (c.active_conditions?.length ?? 0) > 0) ? '#f59e0b' : 'var(--t-2)'} />
        {isOwner && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '2px 8px', borderRadius: 999 }}>DM Controls Active</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', whiteSpace: 'nowrap' }}>Passive Perc DC</span>
              <input
                type="number" value={perceptionDC} onChange={e => setPerceptionDC(e.target.value)}
                placeholder="—" min={0} max={30}
                style={{ width: 44, fontSize: 12, fontFamily: 'var(--ff-stat)', fontWeight: 700, textAlign: 'center', padding: '2px 4px', borderRadius: 5, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── DM action panels ── */}
      {isOwner && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Panel toggle buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              { id: 'aoe',      label: 'AoE Damage' },
              { id: 'rest',     label: 'Party Long Rest' },
              { id: 'announce', label: 'Announcement' },
              { id: 'save',     label: 'Call for Save' },
              { id: 'xp',       label: 'Award XP' },
              { id: 'loot',     label: 'Distribute Loot' },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setDmPanel(dmPanel === id ? null : id); setAoeApplied(null); }}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                  border: dmPanel === id ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
                  background: dmPanel === id ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: dmPanel === id ? 'var(--c-gold-l)' : 'var(--t-2)' }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── AoE DAMAGE PANEL ── */}
          {dmPanel === 'aoe' && (
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f87171' }}>
                AoE / Mass Damage — select targets, enter damage, apply
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {characters.map(c => {
                  const sel = aoeTargets.has(c.id);
                  return (
                    <button key={c.id}
                      onClick={() => { const next = new Set(aoeTargets); sel ? next.delete(c.id) : next.add(c.id); setAoeTargets(next); setAoeApplied(null); }}
                      style={{ fontSize: 11, fontWeight: sel ? 700 : 400, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                        border: sel ? '1px solid rgba(248,113,113,0.5)' : '1px solid var(--c-border-m)',
                        background: sel ? 'rgba(248,113,113,0.12)' : 'var(--c-raised)',
                        color: sel ? '#f87171' : 'var(--t-2)' }}
                    >
                      {sel ? '✓ ' : ''}{c.name}
                      <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.7 }}>{c.current_hp}/{c.max_hp}</span>
                    </button>
                  );
                })}
                <button onClick={() => setAoeTargets(aoeTargets.size === characters.length ? new Set() : new Set(characters.map(c => c.id)))}
                  style={{ fontSize: 10, fontWeight: 600, padding: '4px 8px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-3)' }}>
                  {aoeTargets.size === characters.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="number" value={aoeDamage} onChange={e => { setAoeDamage(e.target.value); setAoeApplied(null); }}
                  placeholder="Damage amount…" min={0} onKeyDown={e => e.key === 'Enter' && applyAoE()}
                  style={{ flex: 1, minWidth: 120, fontSize: 14, fontFamily: 'var(--ff-stat)', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                />
                <button onClick={() => { setAoeHalved(v => !v); setAoeApplied(null); }}
                  style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                    border: aoeHalved ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
                    background: aoeHalved ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                    color: aoeHalved ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
                  {aoeHalved ? '½ Halved' : 'Half damage?'}
                </button>
                <button onClick={applyAoE} disabled={!aoeDamage || parseInt(aoeDamage) <= 0 || aoeTargets.size === 0}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                    border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.1)', color: '#f87171',
                    opacity: (!aoeDamage || parseInt(aoeDamage) <= 0 || aoeTargets.size === 0) ? 0.4 : 1 }}>
                  Apply to {aoeTargets.size} target{aoeTargets.size !== 1 ? 's' : ''}
                </button>
              </div>
              {/* Preview */}
              {aoeDamage && parseInt(aoeDamage) > 0 && aoeTargets.size > 0 && !aoeApplied && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {[...aoeTargets].map(id => {
                    const c = characters.find(x => x.id === id);
                    if (!c) return null;
                    const dmg = aoeHalved ? Math.floor(parseInt(aoeDamage) / 2) : parseInt(aoeDamage);
                    const newHP = Math.max(0, c.current_hp - dmg);
                    return (
                      <span key={id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999,
                        background: newHP <= 0 ? 'rgba(220,38,38,0.12)' : 'rgba(248,113,113,0.08)',
                        border: `1px solid ${newHP <= 0 ? 'rgba(220,38,38,0.4)' : 'rgba(248,113,113,0.2)'}`,
                        color: newHP <= 0 ? '#dc2626' : '#f87171' }}>
                        {c.name}: {c.current_hp} → {newHP}{newHP <= 0 ? ' ☠' : ''}{c.concentration_spell && dmg > 0 ? ' ⚠ Conc.' : ''}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Result */}
              {aoeApplied && (
                <div style={{ padding: '8px 10px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-green-l)', marginBottom: 4 }}>Applied</div>
                  {aoeApplied.map((r, i) => {
                    const concDC = r.took > 0 ? Math.max(10, Math.floor(r.took / 2)) : 0;
                    return (
                      <div key={i} style={{ fontSize: 11, color: 'var(--t-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{r.name} took {r.took} damage</span>
                        {r.concentration && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 7px', borderRadius: 999 }}>
                            Conc. check DC {concDC}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PARTY LONG REST PANEL ── */}
          {dmPanel === 'rest' && (
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)' }}>
                Party Long Rest — all {characters.length} characters
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>
                All characters: full HP, all spell slots restored, half spent hit dice recovered, conditions cleared, death saves reset.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {characters.map(c => (
                  <span key={c.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-2)' }}>
                    {c.name}: {c.current_hp}/{c.max_hp} → {c.max_hp}/{c.max_hp} HP
                  </span>
                ))}
              </div>
              <button onClick={partyLongRest}
                style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, padding: '7px 20px', borderRadius: 8, cursor: 'pointer', minHeight: 0,
                  border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}>
                Start Long Rest for Party
              </button>
            </div>
          )}

          {/* ── ANNOUNCEMENT PANEL ── */}
          {dmPanel === 'announce' && (
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid rgba(212,160,23,0.4)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)' }}>
                DM Announcement — appears as a banner on all player sheets
              </div>
              <textarea
                value={announceText}
                onChange={e => setAnnounceText(e.target.value)}
                placeholder="You hear the distant sound of thunder from beneath the keep…"
                rows={3}
                style={{ fontSize: 13, lineHeight: 1.6, resize: 'vertical', borderRadius: 8, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)', padding: '8px 10px', fontFamily: 'var(--ff-body)' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={broadcastAnnouncement} disabled={!announceText.trim()}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                    border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
                    opacity: !announceText.trim() ? 0.4 : 1 }}>
                  Send to All Players
                </button>
                <span style={{ fontSize: 11, color: 'var(--t-3)', alignSelf: 'center' }}>Dismissible after 30 seconds</span>
              </div>
            </div>
          )}

          {/* ── SAVE PROMPT PANEL ── */}
          {dmPanel === 'save' && (
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#60a5fa' }}>
                Call for Saving Throw — players see the DC and their modifier on their sheet
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={saveAbility} onChange={e => setSaveAbility(e.target.value)}
                  style={{ fontSize: 13, fontWeight: 700, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(96,165,250,0.3)', background: 'var(--c-raised)', color: '#60a5fa', cursor: 'pointer' }}>
                  {['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <span style={{ fontSize: 13, color: 'var(--t-3)', fontWeight: 600 }}>Save</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-2)' }}>DC</span>
                  <input type="number" value={saveDC} onChange={e => setSaveDC(e.target.value)}
                    placeholder="15" min={1} max={30}
                    onKeyDown={e => e.key === 'Enter' && broadcastSavePrompt()}
                    style={{ width: 60, fontSize: 16, fontFamily: 'var(--ff-stat)', fontWeight: 700, textAlign: 'center', padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.05)', color: '#60a5fa' }}
                  />
                </div>
                <button onClick={broadcastSavePrompt} disabled={!saveDC || parseInt(saveDC) <= 0}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                    border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
                    opacity: (!saveDC || parseInt(saveDC) <= 0) ? 0.4 : 1 }}>
                  Send Prompt
                </button>
              </div>
              {/* Preview what players will see */}
              {saveDC && parseInt(saveDC) > 0 && characters.length > 0 && (
                <div style={{ padding: '8px 10px', background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>Preview — players will see:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {characters.map(c => {
                      const abilityMap: Record<string, keyof typeof c> = {
                        Strength: 'strength', Dexterity: 'dexterity', Constitution: 'constitution',
                        Intelligence: 'intelligence', Wisdom: 'wisdom', Charisma: 'charisma',
                      };
                      const score = c[abilityMap[saveAbility] as keyof typeof c] as number ?? 10;
                      const mod = Math.floor((score - 10) / 2);
                      const hasSaveProf = true; // simplified — always show modifier
                      const total = mod; // players add their own prof bonus
                      return (
                        <span key={c.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--c-raised)', border: '1px solid var(--c-border)', color: 'var(--t-2)' }}>
                          {c.name}: {total >= 0 ? '+' : ''}{total} vs DC {saveDC}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* XP Award panel */}
          {dmPanel === 'xp' && (
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)' }}>
                Award XP to Party — splits evenly among {characters.length} player{characters.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number" value={xpInput} onChange={e => setXpInput(e.target.value)}
                  placeholder="Total XP earned…" min={0}
                  onKeyDown={e => e.key === 'Enter' && awardXP()}
                  style={{ flex: 1, fontSize: 14, fontFamily: 'var(--ff-stat)', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                />
                {xpInput && parseInt(xpInput) > 0 && characters.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--t-3)', whiteSpace: 'nowrap' }}>
                    = {Math.floor(parseInt(xpInput) / characters.length)} XP each
                  </span>
                )}
                <button onClick={awardXP} disabled={!xpInput || parseInt(xpInput) <= 0}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                    border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
                    opacity: (!xpInput || parseInt(xpInput) <= 0) ? 0.4 : 1 }}>
                  Award
                </button>
              </div>
              {/* Per-character XP preview with LVL UP indicator */}
              {characters.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {characters.map(c => {
                    const gain = xpInput && parseInt(xpInput) > 0
                      ? Math.floor(parseInt(xpInput) / characters.length)
                      : 0;
                    const newXP = (c.experience_points ?? 0) + gain;
                    const currentLevel = xpToLevel(c.experience_points ?? 0);
                    const newLevel = xpToLevel(newXP);
                    const willLevelUp = newLevel > currentLevel;
                    const nextXP = xpForNextLevel(c.level);
                    return (
                      <div key={c.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6,
                        background: willLevelUp ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                        border: `1px solid ${willLevelUp ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                        color: willLevelUp ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                        {c.name}: {c.experience_points ?? 0}{gain > 0 ? ` → ${newXP}` : ''} / {nextXP} XP
                        {willLevelUp && ' ⬆ LVL UP!'}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Loot Distribution panel */}
          {dmPanel === 'loot' && (
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)' }}>
                Distribute Loot — each player receives a copy
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="number" value={lootGold} onChange={e => setLootGold(e.target.value)}
                    placeholder="Gold to split (GP)…" min={0}
                    style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                  />
                  <input
                    value={lootItem} onChange={e => setLootItem(e.target.value)}
                    placeholder="Item name (each player gets one)…"
                    onKeyDown={e => e.key === 'Enter' && distributeLoot()}
                    style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                  />
                </div>
                <button onClick={distributeLoot} disabled={!lootGold && !lootItem.trim()}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0, alignSelf: 'stretch',
                    border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
                    opacity: (!lootGold && !lootItem.trim()) ? 0.4 : 1 }}>
                  Distribute
                </button>
              </div>
              {lootGold && parseInt(lootGold) > 0 && characters.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--t-3)' }}>
                  {Math.floor(parseInt(lootGold) / characters.length)} GP each ({parseInt(lootGold) % characters.length > 0 ? `${parseInt(lootGold) % characters.length} leftover GP to first player` : 'splits evenly'})
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Character cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--sp-3)' }}>
        {characters.map(char => (
          <PlayerCard
            key={char.id}
            character={char}
            isDM={isOwner}
            perceptionDC={perceptionDC}
            onUpdate={patch => updateChar(char.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Per-character card with DM controls ──────────────────────────────

function PlayerCard({ character: c, isDM, perceptionDC, onUpdate }: {
  character: Character;
  isDM: boolean;
  perceptionDC: string;
  onUpdate: (patch: Partial<Character>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hpInput, setHpInput] = useState('');
  const [activePanel, setActivePanel] = useState<'hp' | 'conditions' | 'spells' | 'inventory' | null>(null);

  const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
  const col = hpColor(c.current_hp, c.max_hp);
  const status = hpLabel(c.current_hp, c.max_hp);
  const isDowned = c.current_hp <= 0;

  const [concDC, setConcDC] = useState<number | null>(null);

  function applyHP(delta: number) {
    const newHP = Math.max(0, Math.min(c.max_hp, c.current_hp + delta));
    onUpdate({ current_hp: newHP });
    setHpInput('');
    // If damage and concentrating, compute DC
    if (delta < 0 && c.concentration_spell) {
      setConcDC(Math.max(10, Math.floor(Math.abs(delta) / 2)));
    } else {
      setConcDC(null);
    }
  }

  function applyHPInput(type: 'damage' | 'heal') {
    const v = parseInt(hpInput);
    if (isNaN(v) || v <= 0) return;
    applyHP(type === 'damage' ? -v : v);
  }

  function toggleCondition(name: string) {
    const current = c.active_conditions ?? [];
    const next = (current.includes(name as any) ? current.filter((x: any) => x !== name) : [...current, name]) as any;
    onUpdate({ active_conditions: next });
  }

  function removeSpell(spellId: string) {
    onUpdate({
      known_spells: c.known_spells.filter(id => id !== spellId),
      prepared_spells: c.prepared_spells.filter(id => id !== spellId),
    });
  }

  function resetSlotLevel(level: number) {
    const slots = { ...(c.spell_slots ?? {}) };
    const key = `level_${level}`;
    if (slots[key]) slots[key] = { ...slots[key], used: 0 };
    onUpdate({ spell_slots: slots as Character['spell_slots'] });
  }

  function useSlot(level: number) {
    const slots = { ...(c.spell_slots ?? {}) };
    const key = `level_${level}`;
    const slot = slots[key];
    if (!slot) return;
    const used = Math.min(slot.total, (slot.used ?? 0) + 1);
    slots[key] = { ...slot, used };
    onUpdate({ spell_slots: slots as Character['spell_slots'] });
  }

  function removeInventoryItem(itemId: string) {
    onUpdate({ inventory: (c.inventory ?? []).filter((i: any) => i.id !== itemId) });
  }

  function adjustCurrency(key: string, delta: number) {
    const curr: any = { ...(c.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }) };
    curr[key] = Math.max(0, (curr[key] ?? 0) + delta);
    onUpdate({ currency: curr });
  }

  const knownSpells = (c.known_spells ?? [])
    .map(id => SPELLS.find(s => s.id === id))
    .filter(Boolean) as typeof SPELLS;

  const slots = c.spell_slots ?? {};
  const hasSlots = Object.keys(slots).some(k => (slots[k]?.total ?? 0) > 0);

  return (
    <div style={{
      border: `1px solid ${isDowned ? 'rgba(220,38,38,0.4)' : col + '30'}`,
      borderRadius: 'var(--r-xl)', background: isDowned ? 'rgba(220,38,38,0.03)' : 'var(--c-card)', overflow: 'hidden',
    }}>
      {/* HP bar top accent */}
      <div style={{ height: 3, background: col, width: `${hpPct * 100}%`, transition: 'width 0.4s' }} />

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Name row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: isDowned ? '#dc2626' : 'var(--t-1)' }}>{c.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 1 }}>{c.class_name} {c.level} · {c.species}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: status.color }}>{status.label}</span>
            {isDM && (
              <button
                onClick={() => setExpanded(v => !v)}
                style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: `1px solid ${expanded ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`, background: expanded ? 'var(--c-gold-bg)' : 'var(--c-raised)', color: expanded ? 'var(--c-gold-l)' : 'var(--t-2)' }}
              >
                {expanded ? 'Close' : 'DM Controls'}
              </button>
            )}
          </div>
        </div>

        {/* HP bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>HP</span>
            <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 12, color: col }}>{c.current_hp} <span style={{ color: 'var(--t-3)', fontWeight: 400 }}>/ {c.max_hp}</span></span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(1, hpPct * 100)}%`, background: col, borderRadius: 999, boxShadow: `0 0 6px ${col}`, transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {c.temp_hp > 0 && <StatMini label="THP" value={`+${c.temp_hp}`} color="#60a5fa" />}
          <StatMini label="AC" value={c.armor_class} color="var(--c-gold-l)" />
          <StatMini label="Speed" value={`${c.speed}ft`} color="var(--t-2)" />
          {hasSlots && <StatMini label="Slots" value={
            [1,2,3,4,5].filter(l => (slots[`level_${l}`]?.total ?? 0) > 0)
              .map(l => { const s = slots[`level_${l}`]; return `${s.total-(s.used??0)}/${s.total}`; }).join(' ')
          } color="#a78bfa" />}
          <PassivePerceptionChip character={c} dcInput={isDM ? perceptionDC : ''} />
        </div>

        {/* Active conditions */}
        {(c.active_conditions?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(c.active_conditions ?? []).map(cond => {
              const m = CONDITION_MAP[cond];
              return (
                <div key={cond} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, background: `${m?.color ?? '#64748b'}15`, border: `1px solid ${m?.color ?? '#64748b'}40`, fontSize: 9, fontWeight: 700, color: m?.color ?? 'var(--t-2)' }}>
                  {m?.icon} {cond}
                  {isDM && (
                    <button onClick={() => toggleCondition(cond)} style={{ marginLeft: 2, fontSize: 9, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.7 }}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── DM CONTROLS PANEL ── */}
        {isDM && expanded && (
          <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Control tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['hp', 'conditions', 'spells', 'inventory'] as const).map(panel => (
                <button
                  key={panel}
                  onClick={() => setActivePanel(activePanel === panel ? null : panel)}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, textTransform: 'capitalize',
                    border: activePanel === panel ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
                    background: activePanel === panel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                    color: activePanel === panel ? 'var(--c-gold-l)' : 'var(--t-3)',
                  }}
                >
                  {panel === 'hp' ? 'Hit Points' : panel === 'conditions' ? 'Conditions' : panel === 'spells' ? 'Spell Slots' : 'Inventory'}
                </button>
              ))}
            </div>

            {/* ── HP PANEL ── */}
            {activePanel === 'hp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Adjust Hit Points</div>
                {/* Typed input */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number" value={hpInput} onChange={e => setHpInput(e.target.value)} placeholder="Amount" min={0}
                    onKeyDown={e => e.key === 'Enter' && applyHPInput('damage')}
                    style={{ flex: 1, fontSize: 13, fontFamily: 'var(--ff-stat)', textAlign: 'center', padding: '6px', borderRadius: 7, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                  />
                  <button onClick={() => applyHPInput('damage')} style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)' }}>Damage</button>
                  <button onClick={() => applyHPInput('heal')} style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)' }}>Heal</button>
                </div>
                {/* Quick buttons */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[-20,-10,-5,-1,1,5,10,20].map(v => (
                    <button key={v} onClick={() => applyHP(v)} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: `1px solid ${v < 0 ? 'var(--stat-str-bdr)' : 'var(--stat-dex-bdr)'}`, background: v < 0 ? 'var(--stat-str-bg)' : 'var(--stat-dex-bg)', color: v < 0 ? 'var(--stat-str)' : 'var(--stat-dex)' }}>
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
                </div>
                {/* Set exact HP */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onUpdate({ current_hp: c.max_hp })} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)' }}>Full HP</button>
                  <button onClick={() => onUpdate({ current_hp: 0 })} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)' }}>Set to 0</button>
                  <button onClick={() => { onUpdate({ inspiration: !c.inspiration }); }} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: `1px solid ${c.inspiration ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`, background: c.inspiration ? 'var(--c-gold-bg)' : 'var(--c-raised)', color: c.inspiration ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
                    {c.inspiration ? '★ Inspired' : 'Give Inspiration'}
                  </button>
                </div>
                {/* Concentration break prompt */}
                {concDC !== null && c.concentration_spell && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>Concentration Check Required</div>
                      <div style={{ fontSize: 10, color: 'var(--t-2)', marginTop: 1 }}>
                        {c.name} is concentrating on <strong>{c.concentration_spell}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 8, padding: '4px 10px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a78bfa' }}>DC</div>
                      <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 20, color: '#a78bfa', lineHeight: 1 }}>{concDC}</div>
                    </div>
                    <button onClick={() => { onUpdate({ concentration_spell: '' }); setConcDC(null); }}
                      style={{ fontSize: 10, fontWeight: 600, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#f87171' }}>
                      Break
                    </button>
                    <button onClick={() => setConcDC(null)}
                      style={{ fontSize: 10, color: 'var(--t-3)', background: 'none', border: '1px solid var(--c-border)', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>
                      Dismiss
                    </button>
                  </div>
                )}
                {/* Temp HP */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--c-border)' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#60a5fa', whiteSpace: 'nowrap' }}>
                    Temp HP {c.temp_hp > 0 ? `(${c.temp_hp})` : ''}
                  </span>
                  <input
                    type="number" placeholder="Amount…" min={0}
                    id={`thp-${c.id}`}
                    style={{ flex: 1, fontSize: 12, fontFamily: 'var(--ff-stat)', textAlign: 'center', padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.05)', color: 'var(--t-1)' }}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById(`thp-${c.id}`) as HTMLInputElement;
                      const v = parseInt(input?.value ?? '');
                      if (!isNaN(v) && v > 0) { onUpdate({ temp_hp: v }); if (input) input.value = ''; }
                    }}
                    style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa' }}
                  >
                    Grant THP
                  </button>
                  {c.temp_hp > 0 && (
                    <button onClick={() => onUpdate({ temp_hp: 0 })} style={{ fontSize: 9, color: 'var(--t-3)', background: 'none', border: '1px solid var(--c-border)', padding: '3px 8px', borderRadius: 6, cursor: 'pointer' }}>Clear</button>
                  )}
                </div>
              </div>
            )}

            {/* ── CONDITIONS PANEL ── */}
            {activePanel === 'conditions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>
                  Apply / Remove Conditions
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {CONDITIONS.map(cond => {
                    const active = (c.active_conditions ?? []).includes(cond.name as any);
                    return (
                      <button
                        key={cond.name}
                        onClick={() => toggleCondition(cond.name as any)}
                        title={cond.description}
                        style={{
                          fontSize: 10, fontWeight: active ? 700 : 500, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                          border: `1px solid ${active ? cond.color : 'var(--c-border-m)'}`,
                          background: active ? `${cond.color}18` : 'var(--c-raised)',
                          color: active ? cond.color : 'var(--t-3)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {cond.icon} {cond.name}
                      </button>
                    );
                  })}
                </div>
                {(c.active_conditions?.length ?? 0) > 0 && (
                  <button onClick={() => onUpdate({ active_conditions: [] })} style={{ alignSelf: 'flex-start', fontSize: 10, color: 'var(--stat-str)', background: 'none', border: '1px solid var(--stat-str-bdr)', padding: '3px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    Clear all conditions
                  </button>
                )}
              </div>
            )}

            {/* ── SPELL SLOTS PANEL ── */}
            {activePanel === 'spells' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Spell Slots & Spells</div>
                {hasSlots ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[1,2,3,4,5,6,7,8,9].map(lvl => {
                      const slot = slots[`level_${lvl}`];
                      if (!slot?.total) return null;
                      const remaining = slot.total - (slot.used ?? 0);
                      return (
                        <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--c-raised)', borderRadius: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-2)', minWidth: 40 }}>Lv {lvl}</span>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {Array.from({ length: slot.total }).map((_, i) => (
                              <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--c-gold-bdr)', background: i < remaining ? 'var(--c-gold)' : 'transparent' }} />
                            ))}
                          </div>
                          <span style={{ fontSize: 10, color: remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)', fontFamily: 'var(--ff-stat)', marginLeft: 2 }}>{remaining}/{slot.total}</span>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                            <button onClick={() => useSlot(lvl)} disabled={remaining <= 0} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, cursor: remaining > 0 ? 'pointer' : 'not-allowed', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)', opacity: remaining <= 0 ? 0.4 : 1 }}>Use</button>
                            <button onClick={() => resetSlotLevel(lvl)} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)' }}>Restore</button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => {
                        const newSlots = { ...(c.spell_slots ?? {}) };
                        Object.keys(newSlots).forEach(k => { newSlots[k] = { ...newSlots[k], used: 0 }; });
                        onUpdate({ spell_slots: newSlots as Character['spell_slots'] });
                      }}
                      style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)' }}
                    >
                      Restore all slots
                    </button>
                  </div>
                ) : <div style={{ fontSize: 12, color: 'var(--t-3)' }}>No spell slots.</div>}

                {/* Known spells — DM can remove */}
                {knownSpells.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 6 }}>Known Spells — click to remove</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                      {knownSpells.map(spell => (
                        <button
                          key={spell.id}
                          onClick={() => removeSpell(spell.id)}
                          title={`Remove ${spell.name}`}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.06)', color: 'var(--t-2)', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {spell.name} <span style={{ color: 'var(--stat-str)', fontSize: 9 }}>✕</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── INVENTORY PANEL ── */}
            {activePanel === 'inventory' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Inventory & Gold</div>

                {/* Currency */}
                <div style={{ background: 'var(--c-raised)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 6 }}>Currency</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(coin => {
                      const colors: Record<string, string> = { pp: '#a78bfa', gp: 'var(--c-gold-l)', ep: '#34d399', sp: '#94a3b8', cp: '#fb923c' };
                      const val = (c.currency as any)?.[coin] ?? 0;
                      return (
                        <div key={coin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: colors[coin] }}>{coin}</span>
                          <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14, color: colors[coin] }}>{val}</span>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button onClick={() => adjustCurrency(coin, -1)} disabled={val <= 0} style={{ fontSize: 9, width: 16, height: 16, borderRadius: '50%', border: `1px solid ${colors[coin]}40`, background: `${colors[coin]}10`, color: colors[coin], cursor: val > 0 ? 'pointer' : 'not-allowed', minHeight: 0, padding: 0, opacity: val <= 0 ? 0.3 : 1 }}>−</button>
                            <button onClick={() => adjustCurrency(coin, 1)} style={{ fontSize: 9, width: 16, height: 16, borderRadius: '50%', border: `1px solid ${colors[coin]}40`, background: `${colors[coin]}10`, color: colors[coin], cursor: 'pointer', minHeight: 0, padding: 0 }}>+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Inventory items */}
                {(c.inventory ?? []).length > 0 ? (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 6 }}>Items — click to remove</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
                      {(c.inventory ?? []).map((item: any) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--c-raised)', borderRadius: 6 }}>
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--t-1)' }}>{item.name}</span>
                          {item.quantity > 1 && <span style={{ fontSize: 10, color: 'var(--t-3)' }}>×{item.quantity}</span>}
                          <button
                            onClick={() => removeInventoryItem(item.id)}
                            style={{ fontSize: 10, color: 'var(--stat-str)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--t-3)' }}>No items in inventory.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 'var(--fs-lg)', color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// ── Passive Perception chip ──────────────────────────────────────────
function PassivePerceptionChip({ character: c, dcInput }: { character: Character; dcInput: string }) {
  const pb = proficiencyBonus(c.level);
  const wisMod = abilityModifier(c.wisdom);
  const hasPerception = (c.skill_proficiencies ?? []).includes('Perception');
  const hasExpertise = (c.skill_expertises ?? []).includes('Perception');
  const bonus = wisMod + (hasExpertise ? pb * 2 : hasPerception ? pb : 0);
  const passivePerc = 10 + bonus;
  const dc = parseInt(dcInput);
  const meetsCheck = !isNaN(dc) && dc > 0 && passivePerc >= dc;
  const failsCheck = !isNaN(dc) && dc > 0 && passivePerc < dc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>Pass. Perc.</span>
      <span style={{
        fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 12,
        color: meetsCheck ? 'var(--c-green-l)' : failsCheck ? '#f87171' : 'var(--t-2)',
        padding: meetsCheck || failsCheck ? '0 4px' : '0',
        borderRadius: 4,
        background: meetsCheck ? 'rgba(5,150,105,0.12)' : failsCheck ? 'rgba(248,113,113,0.1)' : 'transparent',
        transition: 'all 0.2s',
      }}>
        {passivePerc}{meetsCheck ? ' ✓' : failsCheck ? ' ✗' : ''}
      </span>
    </div>
  );
}
