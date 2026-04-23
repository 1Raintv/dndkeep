import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Character, AbilityKey } from '../../types';
import { CONDITIONS, CONDITION_MAP } from '../../data/conditions';
import { xpToLevel, xpForNextLevel, computeStats, abilityModifier, proficiencyBonus } from '../../lib/gameUtils';
import { SPELLS } from '../../data/spells';
import { SKILLS } from '../../data/skills';
import {
  rollCheck, checkModifier, encodeCheckPrompt,
  type CheckTarget, type CheckRollResult,
} from '../../lib/abilityChecks';
import { useDiceRoll } from '../../context/DiceRollContext';
import {
  DAMAGE_TYPES, labelForDamageType, DAMAGE_TYPE_COLORS,
  applyDamageTypeModifiers, type DamageModifier,
} from '../../lib/damageModifiers';
import { buildDefaultResources } from '../../data/classResources';

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
  return { label: 'Downed', color: '#dc2626' };
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
  // v2.166.0 — Phase Q.0 pt 7: damage type for AOE. null = untyped
  // (no resistance / vulnerability / immunity is consulted).
  const [aoeDamageType, setAoeDamageType] = useState<string | null>(null);
  const [aoeApplied, setAoeApplied] = useState<{
    name: string; took: number; concentration: boolean;
    modifier: DamageModifier; // 'none' | 'resistant' | 'vulnerable' | 'immune' | 'cancelled'
  }[] | null>(null);
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
    const results: {
      name: string; took: number; concentration: boolean; modifier: DamageModifier;
    }[] = [];
    // v2.166.0 — Phase Q.0 pt 7: per-target type-aware damage.
    // Order: save-half first (handled by aoeHalved), then per-target
    // resistance/vulnerability/immunity via applyDamageTypeModifiers.
    const halved = aoeHalved ? Math.floor(dmg / 2) : dmg;
    await Promise.all([...aoeTargets].map(id => {
      const c = characters.find(x => x.id === id);
      if (!c) return Promise.resolve();
      const { final: actual, modifier } = applyDamageTypeModifiers(halved, aoeDamageType, c);
      const newHP = Math.max(0, c.current_hp - actual);
      const concBreaks = !!(c.concentration_spell && actual > 0);
      results.push({ name: c.name, took: actual, concentration: concBreaks, modifier });
      const patch: Partial<Character> = { current_hp: newHP };
      if (concBreaks) patch.concentration_spell = '';
      return supabase.from('characters').update(patch).eq('id', id);
    }));
    setAoeApplied(results);
    setAoeDamage('');
    setAoeTargets(new Set());
    setAoeHalved(false);
    setAoeDamageType(null);
  }

  // v2.167.0 — Phase Q.0 pt 8: Party Rest split into Short / Long.
  //
  // partyLongRest now mirrors the per-character doLongRest semantics
  // — previous version covered HP / slots / hit dice / conditions /
  // death saves but skipped class_resources and feature_uses, leaving
  // Action Surge, Channel Divinity, Bardic Inspiration, etc. unspent
  // after a long rest. Fixed by calling buildDefaultResources for
  // each character + clearing feature_uses (matching the player-side
  // doLongRest in CharacterSheet/index.tsx).
  //
  // Hit dice: keeps RAW recovery of floor(level/2) (min 1).
  //
  // partyShortRest broadcasts a `short_rest_prompt` campaign_chat
  // message. Players see a popup linking to their existing rest
  // modal where they can roll hit dice individually. This matches
  // the prompt-then-player-rolls pattern used by save_prompt and
  // check_prompt — the DM doesn't roll hit dice on the players'
  // behalf because each player decides how many to spend.
  async function partyLongRest() {
    await Promise.all(characters.map(c => {
      const recoveredSlots = Object.fromEntries(
        Object.entries(c.spell_slots ?? {}).map(([k, s]) => [k, { ...(s as object), used: 0 }])
      );
      const recoveredHD = Math.max(1, Math.floor(c.level / 2));
      const newSpent = Math.max(0, (c.hit_dice_spent ?? 0) - recoveredHD);
      // Remove Exhaustion from conditions (2024: long rest fully removes
      // unless you were at 0 HP during the rest — we don't track that
      // edge case; remove unconditionally is the common-table behavior).
      const newConditions = (c.active_conditions ?? []).filter((x: string) => x !== 'Exhaustion');
      // v2.167.0 — Phase Q.0 pt 8: full class_resources reset + feature_uses
      // wipe on long rest. Mirrors the CharacterSheet doLongRest path so
      // long rests started by the DM aren't second-class citizens.
      const abilityScores = {
        strength: c.strength, dexterity: c.dexterity, constitution: c.constitution,
        intelligence: c.intelligence, wisdom: c.wisdom, charisma: c.charisma,
      };
      const newResources = buildDefaultResources(c.class_name, c.level, abilityScores);
      // Preserve non-numeric resources (e.g. arrays, objects) since
      // buildDefaultResources only emits numerics.
      const existingRes = (c.class_resources ?? {}) as Record<string, unknown>;
      for (const [key, val] of Object.entries(existingRes)) {
        if (typeof val !== 'number') (newResources as any)[key] = val;
      }
      return supabase.from('characters').update({
        current_hp: c.max_hp,
        temp_hp: 0,
        spell_slots: recoveredSlots,
        active_conditions: newConditions,
        death_saves_successes: 0,
        death_saves_failures: 0,
        hit_dice_spent: newSpent,
        concentration_spell: '',
        class_resources: newResources,
        feature_uses: {},
      }).eq('id', c.id);
    }));
    // Notify players so the inbox / toast surfaces what just happened
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      character_name: 'DM',
      message: 'The party takes a long rest. HP, spell slots, hit dice (half), and class resources restored. Exhaustion cleared.',
      message_type: 'long_rest_completed',
    });
    setDmPanel(null);
  }

  // v2.167.0 — Phase Q.0 pt 8: short rest broadcast.
  // Doesn't touch character state directly — players spend hit dice
  // themselves in their existing CharacterSheet rest modal. This
  // function just sends the prompt and a notification.
  async function partyShortRest() {
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      character_name: 'DM',
      message: JSON.stringify({ kind: 'short' }),
      message_type: 'short_rest_prompt',
    });
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
      <div style={{ fontSize: 36, marginBottom: 12 }}></div>
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
        {/* v2.171.0 — Phase Q.0 pt 12: level chip. Shows "Lv 5" if the
            whole party is the same level, else "Avg Lv X" using floor
            average (matches what the DM would intuit when eyeballing
            encounter difficulty). Hidden with 0 characters. */}
        {characters.length > 0 && (() => {
          const levels = characters.map(c => c.level ?? 1);
          const same = new Set(levels).size === 1;
          const avg = Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length);
          return <SummaryChip label={same ? 'Level' : 'Avg Level'} value={same ? levels[0] : avg} color="var(--c-gold-l)" />;
        })()}
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
              { id: 'rest',     label: 'Party Rest' },
              { id: 'announce', label: 'Announcement' },
              { id: 'save',     label: 'Party Saving Throw' },
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

              {/* v2.166.0 — Phase Q.0 pt 7: damage type picker.
                  When a type is selected, applyAoE consults each target's
                  resistances/vulnerabilities/immunities and adjusts damage
                  per RAW. "Untyped" disables type-based modifiers entirely
                  (useful for raw HP loss like falling damage where the DM
                  doesn't want resistance to apply). */}
              {/* v2.171.0 — Phase Q.0 pt 12: damage type is a dropdown
                  instead of a pill row. 14 pills was visually noisy;
                  a single select is cleaner and faster to scan. The
                  selected type's RAW color renders in the select
                  itself for visual continuity with the result badges. */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t-3)' }}>
                  Type
                </span>
                <select
                  value={aoeDamageType ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setAoeDamageType(v === '' ? null : v as any);
                    setAoeApplied(null);
                  }}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                    border: `1px solid ${aoeDamageType ? (DAMAGE_TYPE_COLORS[aoeDamageType] ?? 'var(--c-border-m)') : 'var(--c-border-m)'}`,
                    background: aoeDamageType ? `${DAMAGE_TYPE_COLORS[aoeDamageType] ?? 'var(--c-gold)'}18` : 'var(--c-raised)',
                    color: aoeDamageType ? (DAMAGE_TYPE_COLORS[aoeDamageType] ?? 'var(--t-1)') : 'var(--t-2)',
                    textTransform: 'capitalize' as const,
                  }}
                  title="Damage type — untyped ignores resistance/vulnerability"
                >
                  <option value="">Untyped</option>
                  {DAMAGE_TYPES.map(t => (
                    <option key={t} value={t}>{labelForDamageType(t)}</option>
                  ))}
                </select>
              </div>

              {/* Preview — type-aware per-target damage breakdown */}
              {aoeDamage && parseInt(aoeDamage) > 0 && aoeTargets.size > 0 && !aoeApplied && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {[...aoeTargets].map(id => {
                    const c = characters.find(x => x.id === id);
                    if (!c) return null;
                    const halved = aoeHalved ? Math.floor(parseInt(aoeDamage) / 2) : parseInt(aoeDamage);
                    const { final: dmg, modifier } = applyDamageTypeModifiers(halved, aoeDamageType, c);
                    const newHP = Math.max(0, c.current_hp - dmg);
                    const modBadge = modifier === 'resistant' ? ' ½' :
                                     modifier === 'vulnerable' ? ' ×2' :
                                     modifier === 'immune' ? ' ⊘' :
                                     modifier === 'cancelled' ? ' ⇄' : '';
                    const modColor = modifier === 'resistant' ? '#60a5fa' :
                                     modifier === 'vulnerable' ? '#f87171' :
                                     modifier === 'immune' ? '#86efac' :
                                     modifier === 'cancelled' ? '#fbbf24' : undefined;
                    return (
                      <span key={id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999,
                        background: newHP <= 0 ? 'rgba(220,38,38,0.12)' : 'rgba(248,113,113,0.08)',
                        border: `1px solid ${newHP <= 0 ? 'rgba(220,38,38,0.4)' : 'rgba(248,113,113,0.2)'}`,
                        color: newHP <= 0 ? '#dc2626' : '#f87171' }}>
                        {/* v2.171.0 — lead with damage dealt (what matters) and
                            show HP transition as supporting detail. Previously
                            read "ghj: 4 → 0" which obscured the fact that the
                            DM dealt 40 damage and overkilled by 36. */}
                        {c.name} takes {dmg} <span style={{ color: 'var(--t-3)', fontWeight: 400 }}>({c.current_hp}→{newHP})</span>
                        {modBadge && <span style={{ color: modColor, marginLeft: 4, fontWeight: 800 }}>{modBadge}</span>}
                        {newHP <= 0 ? ' ☠' : ''}{c.concentration_spell && dmg > 0 ? ' ⚠ Conc.' : ''}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Result — type-aware breakdown */}
              {aoeApplied && (
                <div style={{ padding: '8px 10px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-green-l)', marginBottom: 4 }}>Applied</div>
                  {aoeApplied.map((r, i) => {
                    const concDC = r.took > 0 ? Math.max(10, Math.floor(r.took / 2)) : 0;
                    const modLabel =
                      r.modifier === 'resistant'  ? 'resistant'  :
                      r.modifier === 'vulnerable' ? 'vulnerable' :
                      r.modifier === 'immune'     ? 'immune'     :
                      r.modifier === 'cancelled'  ? 'res+vuln cancel' : null;
                    const modColor =
                      r.modifier === 'resistant'  ? '#60a5fa' :
                      r.modifier === 'vulnerable' ? '#f87171' :
                      r.modifier === 'immune'     ? '#86efac' :
                      r.modifier === 'cancelled'  ? '#fbbf24' : 'var(--t-3)';
                    return (
                      <div key={i} style={{ fontSize: 11, color: 'var(--t-2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{r.name} took {r.took} damage</span>
                        {modLabel && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: modColor, background: `${modColor}1a`, border: `1px solid ${modColor}55`, padding: '1px 7px', borderRadius: 999 }}>
                            {modLabel}
                          </span>
                        )}
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
            <div style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)' }}>
                Party Rest — {characters.length} character{characters.length !== 1 ? 's' : ''}
              </div>

              {/* Two side-by-side rest cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* SHORT REST */}
                <div style={{ padding: '12px 14px', background: 'var(--c-raised)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#60a5fa' }}>
                    Short Rest
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-2)', lineHeight: 1.5 }}>
                    Each player gets a popup to spend hit dice and recover short-rest abilities (Action Surge, Channel Divinity, Warlock slots, etc.).
                  </div>
                  <button
                    onClick={partyShortRest}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                      border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.12)', color: '#60a5fa',
                    }}
                  >
                    📨 Prompt Short Rest
                  </button>
                </div>

                {/* LONG REST */}
                <div style={{ padding: '12px 14px', background: 'var(--c-raised)', border: '1px solid var(--c-gold-bdr)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--c-gold-l)' }}>
                    Long Rest
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-2)', lineHeight: 1.5 }}>
                    Auto-applies to all party: full HP, all spell slots, half spent hit dice, conditions cleared, death saves reset, class resources restored.
                  </div>
                  <button
                    onClick={partyLongRest}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                      border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
                    }}
                  >
                    🌙 Apply Long Rest
                  </button>
                </div>
              </div>

              {/* v2.171.0 — Phase Q.0 pt 12: Long Rest preview block
                  removed per playtest feedback. It just listed every
                  character's HP transition to full, which is obvious
                  (that's what a long rest does) and added noise to a
                  panel that's trying to be a quick two-click action. */}
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
                Party Saving Throw — players see the DC and their modifier on their sheet
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

      {/* v2.170.0 — Phase Q.0 pt 11: grid bumped 340→420px minimum so a
          party of 4 visibly fits 2-per-line on a standard laptop screen.
          With DM Controls expanded, cards simply grow taller inside the
          2-column layout rather than jumping to full row width (the
          v2.169 gridColumn: 1/-1 hack was too disruptive). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 'var(--sp-3)' }}>
        {characters.map(char => (
          <PlayerCard
            key={char.id}
            character={char}
            isDM={isOwner}
            perceptionDC={perceptionDC}
            campaignId={campaignId}
            onUpdate={patch => updateChar(char.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Per-character card with DM controls ──────────────────────────────

function PlayerCard({ character: c, isDM, perceptionDC, campaignId, onUpdate }: {
  character: Character;
  isDM: boolean;
  perceptionDC: string;
  campaignId: string;
  onUpdate: (patch: Partial<Character>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hpInput, setHpInput] = useState('');
  // v2.170.0 — currency panel: amount + coin selector + Apply button.
  const [currencyAmount, setCurrencyAmount] = useState('');
  const [currencyCoin, setCurrencyCoin] = useState<'pp'|'gp'|'ep'|'sp'|'cp'>('gp');
  // v2.170.0 — conditions panel dropdown selection (applied via button).
  const [conditionToAdd, setConditionToAdd] = useState<string>('');
  const [activePanel, setActivePanel] = useState<'hp' | 'conditions' | 'checks' | 'inventory' | null>(null);

  const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
  const col = hpColor(c.current_hp, c.max_hp);
  const status = hpLabel(c.current_hp, c.max_hp);
  const isDowned = c.current_hp <= 0;

  const [concDC, setConcDC] = useState<number | null>(null);

  // v2.169.0 — Phase Q.0 pt 10: apply damage against temp_hp first
  // per 2024 RAW. Previously we only adjusted current_hp, so a PC
  // with 5 temp HP + 20 current HP who took 10 damage would drop
  // to 10 current HP with 5 temp HP untouched — which is both wrong
  // and confusing. Now damage bleeds through temp first, then
  // current; healing goes directly to current_hp (temp HP is not
  // affected by healing, again per RAW — they're independent pools).
  function applyHP(delta: number) {
    const oldHP = c.current_hp;
    const oldTemp = c.temp_hp ?? 0;
    let newHP = oldHP;
    let newTemp = oldTemp;

    if (delta < 0) {
      // Damage — eat temp HP first
      const damage = -delta;
      const absorbed = Math.min(oldTemp, damage);
      newTemp = oldTemp - absorbed;
      const remaining = damage - absorbed;
      newHP = Math.max(0, oldHP - remaining);
    } else {
      // Healing — regular HP only, capped at max
      newHP = Math.min(c.max_hp, oldHP + delta);
    }

    const patch: Partial<Character> = { current_hp: newHP };
    if (newTemp !== oldTemp) patch.temp_hp = newTemp;
    onUpdate(patch);
    setHpInput('');

    // If damage and concentrating, compute DC from the *total* damage dealt
    // (RAW: DC = max(10, floor(damage/2))). Temp HP absorption still counts.
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
      // v2.170.0 — no longer span full row on expand. Grid is 2-col at
      // ~420px min, which comfortably fits all DM Controls content.
    }}>
      {/* v2.171.0 — Phase Q.0 pt 12: removed the 3px colored top-accent
          strip that duplicated the labeled HP bar below. Two bars for
          the same stat was confusing DMs scanning the party tab. The
          proper HP bar (with label + "62/62" readout) stays. */}

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
              {(['hp', 'conditions', 'checks', 'inventory'] as const).map(panel => (
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
                  {panel === 'hp' ? 'Hit Points' : panel === 'conditions' ? 'Conditions' : panel === 'checks' ? 'Checks' : 'Inventory'}
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
                {/* v2.170.0 — Phase Q.0 pt 11: all quick HP buttons
                    removed per playtest feedback. Damage/heal must go
                    through the typed input above — forces intentional
                    amount entry. The Full HP / Set to 0 / Inspiration
                    row below still serves fast common cases. */}
                {/* Set exact HP */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onUpdate({ current_hp: c.max_hp })} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)' }}>Full HP</button>
                  <button onClick={() => onUpdate({ current_hp: 0 })} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)' }}>Set to 0</button>
                  <button onClick={() => { onUpdate({ inspiration: !c.inspiration }); }} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: `1px solid ${c.inspiration ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`, background: c.inspiration ? 'var(--c-gold-bg)' : 'var(--c-raised)', color: c.inspiration ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
                    {c.inspiration ? 'Inspired' : 'Give Inspiration'}
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
            {/* v2.170.0 — Phase Q.0 pt 11: redesigned per playtest. The
                previous layout was a toggle-grid of 15 condition pills
                which made it hard to see WHICH conditions were actually
                applied. New layout: active conditions listed at top
                (click × to remove), dropdown + Apply button at the
                bottom for adding new ones. Cleaner visual hierarchy. */}
            {activePanel === 'conditions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>
                  Conditions
                </div>

                {/* Active conditions (or empty state) */}
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--t-3)', marginBottom: 5 }}>
                    Active
                  </div>
                  {(c.active_conditions ?? []).length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
                      No conditions applied.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(c.active_conditions ?? []).map((name: any) => {
                        const cond = CONDITION_MAP[name as keyof typeof CONDITION_MAP];
                        const color = cond?.color ?? 'var(--c-gold-l)';
                        return (
                          <span
                            key={name}
                            title={cond?.description ?? ''}
                            style={{
                              fontSize: 11, fontWeight: 700,
                              padding: '4px 4px 4px 10px', borderRadius: 999,
                              border: `1px solid ${color}`,
                              background: `${color}18`, color,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            {cond?.icon ?? '•'} {name}
                            <button
                              onClick={() => toggleCondition(name as any)}
                              style={{
                                fontSize: 11, color, background: 'none', border: 'none',
                                cursor: 'pointer', padding: '0 4px', lineHeight: 1,
                                fontWeight: 800,
                              }}
                              title={`Remove ${name}`}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Add a condition — dropdown + Apply */}
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--t-3)', marginBottom: 5 }}>
                    Add condition
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={conditionToAdd}
                      onChange={e => setConditionToAdd(e.target.value)}
                      style={{ flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
                    >
                      <option value="">Pick a condition…</option>
                      {CONDITIONS
                        .filter(cond => !(c.active_conditions ?? []).includes(cond.name as any))
                        .map(cond => (
                          <option key={cond.name} value={cond.name}>
                            {cond.icon} {cond.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => {
                        if (conditionToAdd) {
                          toggleCondition(conditionToAdd);
                          setConditionToAdd('');
                        }
                      }}
                      disabled={!conditionToAdd}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                        border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
                        opacity: conditionToAdd ? 1 : 0.4,
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {(c.active_conditions?.length ?? 0) > 0 && (
                  <button onClick={() => onUpdate({ active_conditions: [] })} style={{ alignSelf: 'flex-start', fontSize: 10, color: 'var(--stat-str)', background: 'none', border: '1px solid var(--stat-str-bdr)', padding: '3px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    Clear all conditions
                  </button>
                )}
              </div>
            )}

            {/* ── SPELL SLOTS PANEL ── */}
            {/* v2.163.0 — Phase Q.0 pt 4: Checks panel.
                Replaced the prior "Spell Slots" panel — DMs rarely
                manage spell slots manually (players do that on their
                own sheet). The Checks panel lets the DM either:
                  • Roll Secret — DM rolls on the player's behalf and
                    sees the result inline. Useful for hidden checks
                    like Perception that the player shouldn't know
                    they failed.
                  • Prompt Player — broadcasts a check_prompt message
                    so the player gets a popup + entry in their
                    notifications inbox.
                Skill picker covers all 18 PHB skills; raw ability
                buttons (STR/DEX/CON/INT/WIS/CHA) handle the
                non-skill cases like a raw STR check to break a door. */}
            {activePanel === 'checks' && (
              <ChecksPanel character={c} campaignId={campaignId} />
            )}

            {/* ── INVENTORY PANEL ── */}
            {activePanel === 'inventory' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Inventory & Gold</div>

                {/* v2.170.0 — Phase Q.0 pt 11: currency panel completely
                    rebuilt per playtest feedback. Previous design had
                    per-coin +/- buttons which reportedly didn't work
                    reliably (likely because the realtime round-trip
                    wasn't visibly confirming the write). New design:
                    one amount input + one coin dropdown + one Apply
                    button. Single-click, single-write, single-refresh
                    — explicit and unambiguous. Current totals shown
                    above for reference. */}
                <div style={{ background: 'var(--c-raised)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 8 }}>
                    Currency
                  </div>

                  {/* Current totals — read-only display */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, justifyContent: 'space-between' }}>
                    {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(coin => {
                      const colors: Record<string, string> = { pp: '#a78bfa', gp: 'var(--c-gold-l)', ep: '#34d399', sp: '#94a3b8', cp: '#fb923c' };
                      const val = (c.currency as any)?.[coin] ?? 0;
                      return (
                        <div key={coin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: colors[coin] }}>{coin}</span>
                          <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 16, color: colors[coin] }}>{val}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Amount input + coin selector + Apply */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={currencyAmount}
                      onChange={e => setCurrencyAmount(e.target.value)}
                      placeholder="Amount"
                      min={0}
                      style={{ flex: 1, fontSize: 12, fontFamily: 'var(--ff-stat)', fontWeight: 700, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-card)', color: 'var(--t-1)' }}
                    />
                    <select
                      value={currencyCoin}
                      onChange={e => setCurrencyCoin(e.target.value as typeof currencyCoin)}
                      style={{ fontSize: 11, fontWeight: 700, padding: '5px 6px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-card)', color: 'var(--t-1)' }}
                    >
                      <option value="gp">GP</option>
                      <option value="pp">PP</option>
                      <option value="ep">EP</option>
                      <option value="sp">SP</option>
                      <option value="cp">CP</option>
                    </select>
                    <button
                      onClick={() => {
                        const amt = parseInt(currencyAmount);
                        if (!isNaN(amt) && amt !== 0) {
                          adjustCurrency(currencyCoin, amt);
                          setCurrencyAmount('');
                        }
                      }}
                      disabled={!currencyAmount || isNaN(parseInt(currencyAmount)) || parseInt(currencyAmount) === 0}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
                        border: '1px solid var(--c-gold-bdr)',
                        background: 'var(--c-gold-bg)',
                        color: 'var(--c-gold-l)',
                        opacity: (!currencyAmount || isNaN(parseInt(currencyAmount)) || parseInt(currencyAmount) === 0) ? 0.4 : 1,
                      }}
                      title="Positive = add, negative = subtract"
                    >
                      Apply
                    </button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 5 }}>
                    Enter a positive number to add, negative to subtract (e.g. −10 to take away).
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

// ── ChecksPanel ──────────────────────────────────────────────────────
// v2.163.0 — Phase Q.0 pt 4: ability check tooling for the DM.
// v2.168.0 — Phase Q.0 pt 9: restructured into three sections
//   (Skills / Raw check / Saving throws), every option now displays
//   the character's live modifier so the DM can see at-a-glance what
//   this character is good at. Saves added as a first-class section
//   with proficiency markers; kind:'save' targets roll secretly via
//   rollCheck and prompt via the existing save_prompt message_type.
//
// DM workflow:
//   1. Pick a skill (dropdown), raw ability (button), or save (button).
//      Each option shows the character's modifier inline, so the DM
//      doesn't have to flip to a sheet to see that this rogue has
//      Stealth +11.
//   2. Optionally toggle Advantage / Disadvantage / DC.
//   3. Click "🎲 Roll Secret" to roll on the player's behalf and see
//      the result inline. No broadcast — the player has no idea the
//      DM rolled. Useful for hidden Perception, secret Insight, etc.
//   4. Click "📨 Prompt Player" to send a notification that surfaces
//      the roll in the player's dice tray. Check/raw-check targets
//      send check_prompt; save targets send save_prompt so the player
//      sees the proper save banner.

function ChecksPanel({ character: c, campaignId }: {
  character: Character;
  campaignId: string;
}) {
  const { triggerRoll } = useDiceRoll();
  const [target, setTarget] = useState<CheckTarget>({ kind: 'skill', name: 'Perception' });
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [dc, setDc] = useState<string>('');
  const [lastResult, setLastResult] = useState<CheckRollResult | null>(null);
  const [promptSent, setPromptSent] = useState(false);

  function setAdv(v: boolean) {
    setAdvantage(v);
    if (v) setDisadvantage(false);
  }
  function setDis(v: boolean) {
    setDisadvantage(v);
    if (v) setAdvantage(false);
  }

  function rollSecret() {
    const result = rollCheck(c, target, { advantage, disadvantage });
    setLastResult(result);
    // Surface visually in DM's 3D dice tray. No broadcast.
    triggerRoll({
      result: result.d20,
      dieType: 20,
      modifier: result.modifier,
      total: result.total,
      label: `${c.name} — ${result.label} (secret)`,
      advantage,
      disadvantage,
    });
  }

  async function promptPlayer() {
    const dcVal = parseInt(dc);
    const dcParam = !isNaN(dcVal) && dcVal > 0 ? dcVal : undefined;

    // v2.168.0 — saves go through save_prompt (existing party-wide
    // banner). Checks still go through check_prompt. We route by
    // target.kind so the player sees the right UI on their end.
    if (target.kind === 'save') {
      // save_prompt requires a DC (player UI shows "needs X more to
      // succeed"). Default to 10 if DM didn't set one.
      const effectiveDc = dcParam ?? 10;
      const abilityFull = target.ability.charAt(0).toUpperCase() + target.ability.slice(1);
      await supabase.from('campaign_chat').insert({
        campaign_id: campaignId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        character_name: 'DM',
        message: JSON.stringify({ ability: abilityFull, dc: effectiveDc }),
        message_type: 'save_prompt',
      });
    } else {
      const payload = encodeCheckPrompt({
        target: target.kind === 'skill' ? target.name : target.ability.slice(0, 3).toUpperCase(),
        kind: target.kind,
        dc: dcParam,
        advantage: advantage || undefined,
        disadvantage: disadvantage || undefined,
      });
      await supabase.from('campaign_chat').insert({
        campaign_id: campaignId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        character_name: 'DM',
        message: payload,
        message_type: 'check_prompt',
      });
    }
    setPromptSent(true);
    setTimeout(() => setPromptSent(false), 2000);
  }

  // Live preview mod for the currently-selected target (header strip).
  const previewMod = (() => {
    const r = rollCheck(c, target, {});
    return r.modifier;
  })();

  // v2.168.0: precompute modifiers for every option so every button /
  // dropdown entry shows e.g. "STR -1" or "Stealth (+6) ★". Keeps the
  // DM informed without having to click through each one first.
  const abilityKeys: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const rawMods = abilityKeys.map(a => ({
    ability: a,
    ...checkModifier(c, { kind: 'ability', ability: a }),
  }));
  const saveMods = abilityKeys.map(a => ({
    ability: a,
    ...checkModifier(c, { kind: 'save', ability: a }),
  }));
  const skillMods = SKILLS.map(s => ({
    name: s.name,
    ...checkModifier(c, { kind: 'skill', name: s.name }),
  }));

  const fmtMod = (m: number) => `${m >= 0 ? '+' : ''}${m}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>
        Ability Checks
      </div>

      {/* ─── Skills section ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Skills
        </div>
        <select
          value={target.kind === 'skill' ? target.name : ''}
          onChange={e => setTarget({ kind: 'skill', name: e.target.value })}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
        >
          <option value="" disabled>Pick a skill…</option>
          {skillMods.map(s => (
            <option key={s.name} value={s.name}>
              {s.name} ({fmtMod(s.mod)}){s.expert ? ' ★★' : s.proficient ? ' ★' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Raw check section ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Raw check
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {rawMods.map(r => {
            const selected = target.kind === 'ability' && target.ability === r.ability;
            return (
              <button
                key={r.ability}
                onClick={() => setTarget({ kind: 'ability', ability: r.ability })}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', minHeight: 0,
                  border: selected ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
                  background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: selected ? 'var(--c-gold-l)' : 'var(--t-2)',
                  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  fontFamily: 'var(--ff-stat)',
                }}
                title={`Raw ${r.ability} check (no proficiency)`}
              >
                {r.ability.slice(0, 3)} {fmtMod(r.mod)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Saving throws section ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Saving throws
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {saveMods.map(s => {
            const selected = target.kind === 'save' && target.ability === s.ability;
            return (
              <button
                key={s.ability}
                onClick={() => setTarget({ kind: 'save', ability: s.ability })}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5, cursor: 'pointer', minHeight: 0,
                  border: selected
                    ? '1px solid var(--c-gold-bdr)'
                    : s.proficient
                      ? '1px solid rgba(167,139,250,0.5)'
                      : '1px solid var(--c-border-m)',
                  background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: selected ? 'var(--c-gold-l)' : s.proficient ? '#a78bfa' : 'var(--t-2)',
                  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  fontFamily: 'var(--ff-stat)',
                }}
                title={`${s.ability} save${s.proficient ? ' (proficient)' : ''}`}
              >
                {s.ability.slice(0, 3)} {fmtMod(s.mod)}{s.proficient ? ' ★' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advantage / Disadvantage / DC */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={advantage} onChange={e => setAdv(e.target.checked)} />
          Adv
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={disadvantage} onChange={e => setDis(e.target.checked)} />
          Dis
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>DC</label>
          <input
            type="number" min={1} max={30}
            value={dc} onChange={e => setDc(e.target.value)}
            placeholder="—"
            style={{ width: 40, fontSize: 11, fontFamily: 'var(--ff-stat)', fontWeight: 700, textAlign: 'center', padding: '2px 4px', borderRadius: 5, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
          />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-body)' }}>
          mod {fmtMod(previewMod)}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={rollSecret}
          style={{
            flex: 1,
            fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
            border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)',
          }}
          title="DM rolls on the player's behalf. Result is private — the player isn't notified."
        >
          🎲 Roll Secret
        </button>
        <button
          onClick={promptPlayer}
          style={{
            flex: 1,
            fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
            border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
          }}
          title={target.kind === 'save'
            ? "Sends a save_prompt so the player sees the save banner on their sheet."
            : "Sends a check_prompt so the player sees the check banner on their sheet."}
        >
          📨 Prompt Player
        </button>
      </div>

      {promptSent && (
        <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, textAlign: 'center' }}>
          Prompt sent
        </div>
      )}

      {/* Last result */}
      {lastResult && (
        <div style={{
          padding: '8px 10px', borderRadius: 7,
          background: 'var(--c-raised)', border: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 18,
            color: lastResult.d20 === 20 ? '#4ade80' : lastResult.d20 === 1 ? '#ef4444' : 'var(--c-gold-l)',
            minWidth: 28, textAlign: 'center',
          }}>
            {lastResult.total}
          </div>
          <div style={{ flex: 1, fontSize: 10, color: 'var(--t-2)', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, color: 'var(--t-1)' }}>
              {lastResult.label}
              {lastResult.proficient && <span style={{ color: 'var(--c-gold-l)', marginLeft: 4 }}>★</span>}
              {lastResult.expert && <span style={{ color: '#a78bfa', marginLeft: 2 }}>★</span>}
            </div>
            <div>
              d20: {lastResult.d20Rolls.join(', ')} → {lastResult.d20}
              {' '}{lastResult.modifier >= 0 ? '+' : ''}{lastResult.modifier} = {lastResult.total}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
