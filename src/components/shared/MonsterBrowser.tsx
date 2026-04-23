import { useState, useMemo, useEffect } from 'react';
import { useMonsters } from '../../lib/hooks/useMonsters';
import { formatCR } from '../../lib/monsterUtils';
import { abilityModifier, rollDiceExpression } from '../../lib/gameUtils';
import { supabase } from '../../lib/supabase';
import type { MonsterData, Character } from '../../types';

const CR_ORDER = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const SIZES = ['All', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

function crSort(a: MonsterData, b: MonsterData) {
  return CR_ORDER.indexOf(String(a.cr)) - CR_ORDER.indexOf(String(b.cr));
}

function mod(score: number) {
  const m = abilityModifier(score);
  return (m >= 0 ? '+' : '') + m;
}

interface MonsterBrowserProps {
  /** If provided, show an "Add to Combat" button */
  onAddToCombat?: (monster: MonsterData) => void;
  compact?: boolean;
  /** v2.94.0 — Phase B: filter to show only SRD, only homebrew, or both */
  initialSourceFilter?: 'all' | 'srd' | 'homebrew';
  /** v2.142.0 — Phase M pt 5: initial ruleset filter. */
  initialRulesetFilter?: '2014' | '2024' | null;
  /** v2.177.0 — Phase Q.0 pt 18: when provided, the damage dice and
   *  save DC pills in action rows become clickable buttons. Clicking
   *  a damage pill opens a PC target picker; Apply rolls the dice and
   *  applies damage. Clicking a DC pill broadcasts a save_prompt chat
   *  message (same flow as PartyDashboard's Party Saving Throw). */
  campaignId?: string | null;
}

export default function MonsterBrowser({
  onAddToCombat, compact = false,
  initialSourceFilter = 'all',
  initialRulesetFilter = null,
  campaignId = null,
}: MonsterBrowserProps) {
  const { monsters } = useMonsters();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sizeFilter, setSizeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'srd' | 'homebrew'>(initialSourceFilter);
  const [rulesetFilter, setRulesetFilter] = useState<'all' | '2014' | '2024'>(
    initialRulesetFilter ?? 'all'
  );
  const [crMin, setCrMin] = useState('');
  const [crMax, setCrMax] = useState('');
  const [selected, setSelected] = useState<MonsterData | null>(null);

  // v2.177.0 — Phase Q.0 pt 18: DM-mode interactive keyword state.
  // `partyChars` is only populated when campaignId is provided, which
  // is the trigger for rendering the clickable damage/DC pills.
  // `kwPicker` holds an in-flight target-picker session: null when
  // closed, {kind, dice/dc/type, chosenIds, source} when open.
  const [partyChars, setPartyChars] = useState<Character[]>([]);
  const [kwPicker, setKwPicker] = useState<
    | null
    | { kind: 'damage'; dice: string; dmgType?: string; actionName: string; targets: Set<string> }
    | { kind: 'save'; dc: number; saveType: string; actionName: string; targets: Set<string> }
  >(null);
  const [kwFlash, setKwFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) { setPartyChars([]); return; }
    let cancelled = false;
    (async () => {
      const { data: members } = await supabase
        .from('campaign_members').select('user_id').eq('campaign_id', campaignId);
      if (!members?.length || cancelled) return;
      const userIds = members.map((m: any) => m.user_id);
      const { data: chars } = await supabase
        .from('characters')
        .select('id,name,level,class_name,current_hp,max_hp,temp_hp,armor_class,strength,dexterity,constitution,intelligence,wisdom,charisma')
        .in('user_id', userIds).eq('campaign_id', campaignId);
      if (!cancelled) setPartyChars((chars ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  // v2.177.0 — Phase Q.0 pt 18: apply damage from a damage-pill click.
  // Rolls the dice expression, subtracts from current_hp (after
  // temp_hp absorption per RAW), and updates the row. Temp HP absorbs
  // first: `damage = total_damage - temp_hp; temp_hp = max(0, temp_hp - total)`.
  async function applyKeywordDamage() {
    if (!kwPicker || kwPicker.kind !== 'damage' || kwPicker.targets.size === 0) return;
    let rolled: { total: number; rolls: number[] } | null = null;
    try {
      rolled = rollDiceExpression(kwPicker.dice);
    } catch {
      rolled = null;
    }
    if (!rolled) return;
    const totalDmg = rolled.total;
    const targets = partyChars.filter(c => kwPicker.targets.has(c.id));
    await Promise.all(targets.map(c => {
      const temp = c.temp_hp ?? 0;
      const absorbed = Math.min(temp, totalDmg);
      const remaining = totalDmg - absorbed;
      const newTemp = temp - absorbed;
      const newHp = Math.max(0, (c.current_hp ?? c.max_hp) - remaining);
      return supabase.from('characters')
        .update({ current_hp: newHp, temp_hp: newTemp })
        .eq('id', c.id);
    }));
    setKwFlash(`Applied ${totalDmg}${kwPicker.dmgType ? ` ${kwPicker.dmgType}` : ''} to ${targets.length} target${targets.length === 1 ? '' : 's'}`);
    setTimeout(() => setKwFlash(null), 3000);
    setKwPicker(null);
  }

  // v2.177.0 — Phase Q.0 pt 18: broadcast a save prompt from a DC-pill
  // click. Mirrors PartyDashboard's broadcastSavePrompt but targets a
  // subset of characters via the v2.173 targeted-announcement payload
  // pattern. The save prompt schema doesn't carry targets, so we
  // encode them inline in the message JSON.
  async function broadcastKeywordSave() {
    if (!kwPicker || kwPicker.kind !== 'save' || kwPicker.targets.size === 0) return;
    const payload = JSON.stringify({
      ability: kwPicker.saveType,
      dc: kwPicker.dc,
      source: kwPicker.actionName,
      targets: Array.from(kwPicker.targets),
    });
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      character_name: 'DM',
      message: payload,
      message_type: 'save_prompt',
    });
    setKwFlash(`Sent DC ${kwPicker.dc} ${kwPicker.saveType} save to ${kwPicker.targets.size} target${kwPicker.targets.size === 1 ? '' : 's'}`);
    setTimeout(() => setKwFlash(null), 3000);
    setKwPicker(null);
  }

  const TYPES = useMemo(
    () => ['All', ...Array.from(new Set(monsters.map(m => m.type))).sort()],
    [monsters]
  );

  const filtered = useMemo(() => {
    return monsters
      .filter(m => {
        if (typeFilter !== 'All' && m.type !== typeFilter) return false;
        if (sizeFilter !== 'All' && m.size !== sizeFilter) return false;
        if (sourceFilter !== 'all') {
          const isHomebrew = m.source === 'homebrew' || m.license_key === 'homebrew';
          if (sourceFilter === 'homebrew' && !isHomebrew) return false;
          if (sourceFilter === 'srd' && isHomebrew) return false;
        }
        // v2.142.0 — Phase M pt 5: ruleset filter. A monster with null
        // ruleset_version (homebrew without a declared version) is shown
        // regardless of filter so legitimate homebrew content isn't
        // accidentally hidden.
        if (rulesetFilter !== 'all') {
          if (m.ruleset_version && m.ruleset_version !== rulesetFilter) return false;
        }
        if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (crMin) {
          const minIdx = CR_ORDER.indexOf(crMin);
          if (CR_ORDER.indexOf(String(m.cr)) < minIdx) return false;
        }
        if (crMax) {
          const maxIdx = CR_ORDER.indexOf(crMax);
          if (CR_ORDER.indexOf(String(m.cr)) > maxIdx) return false;
        }
        return true;
      })
      .sort(crSort);
  }, [monsters, search, typeFilter, sizeFilter, sourceFilter, rulesetFilter, crMin, crMax]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected && !compact ? '1fr 1fr' : '1fr', gap: 'var(--sp-6)' }}>
      {/* Left: list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {/* v2.94.0 — Phase B: source filter pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([['all', 'All'], ['srd', 'Official (SRD)'], ['homebrew', 'Homebrew']] as const).map(([id, label]) => {
            const active = sourceFilter === id;
            const color = id === 'homebrew' ? '#a78bfa' : id === 'srd' ? '#60a5fa' : 'var(--c-gold-l)';
            return (
              <button key={id} onClick={() => setSourceFilter(id)} style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                border: active ? `1px solid ${color}` : '1px solid var(--c-border)',
                background: active ? `${color}20` : 'transparent',
                color: active ? color : 'var(--t-2)',
                minHeight: 0,
              }}>{label}</button>
            );
          })}
        </div>

        {/* v2.142.0 — Phase M pt 5: ruleset filter pills. Currently all 334
            SRD rows are 2014; 2024 will return 0 until data is loaded. We
            still show the filter so infrastructure is visible and DMs can
            opt in when 2024 data lands. */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([['all', 'All Rulesets'], ['2014', '2014'], ['2024', '2024']] as const).map(([id, label]) => {
            const active = rulesetFilter === id;
            const color = id === '2024' ? '#34d399' : id === '2014' ? '#f59e0b' : 'var(--c-gold-l)';
            return (
              <button key={id} onClick={() => setRulesetFilter(id)} style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                border: active ? `1px solid ${color}` : '1px solid var(--c-border)',
                background: active ? `${color}20` : 'transparent',
                color: active ? color : 'var(--t-2)',
                minHeight: 0,
              }}>{label}</button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <input
            placeholder="Search monsters..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 2, minWidth: 140, fontSize: 'var(--fs-sm)' }}
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ flex: 1, minWidth: 110, fontSize: 'var(--fs-sm)' }}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ width: 90, fontSize: 'var(--fs-sm)' }}>
            {SIZES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={crMin} onChange={e => setCrMin(e.target.value)} style={{ width: 80, fontSize: 'var(--fs-sm)' }}>
            <option value="">CR min</option>
            {CR_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={crMax} onChange={e => setCrMax(e.target.value)} style={{ width: 80, fontSize: 'var(--fs-sm)' }}>
            <option value="">CR max</option>
            {CR_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.06em' }}>
          {filtered.length} monster{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Monster list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: compact ? 320 : '60vh', overflowY: 'auto', paddingRight: 4 }}>
          {filtered.map(m => (
            <button
              key={m.id}
              onClick={() => setSelected(selected?.id === m.id ? null : m)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--r-sm)',
                border: selected?.id === m.id ? '1px solid var(--c-gold)' : '1px solid var(--c-border)',
                background: selected?.id === m.id ? 'rgba(201,146,42,0.1)' : '#080d14',
                cursor: 'pointer', transition: 'all var(--tr-fast)', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: selected?.id === m.id ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                    {m.name}
                  </span>
                  {(m.source === 'homebrew' || m.license_key === 'homebrew') && (
                    <span style={{
                      fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      padding: '1px 5px', borderRadius: 3,
                      color: '#a78bfa',
                      background: 'rgba(167,139,250,0.15)',
                      border: '1px solid rgba(167,139,250,0.3)',
                    }}>Homebrew</span>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {m.size} {m.type}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  CR {formatCR(m.cr)} · {m.hp}hp · AC {m.ac}
                </span>
                {onAddToCombat && (
                  <button
                    onClick={e => { e.stopPropagation(); onAddToCombat(m); }}
                    className="btn-gold btn-sm"
                    style={{ fontSize: 9, padding: '2px 7px' }}
                  >
                    + Combat
                  </button>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
              No monsters match your filters.
            </div>
          )}
        </div>
      </div>

      {/* Right: stat block */}
      {selected && !compact && (
        <div key={selected.id} className="animate-fade-in">
          <StatBlock
            monster={selected}
            onAddToCombat={onAddToCombat}
            campaignId={campaignId}
            partyChars={partyChars}
            onKwDamage={(dice, dmgType, actionName) => setKwPicker({ kind: 'damage', dice, dmgType, actionName, targets: new Set() })}
            onKwSave={(dc, saveType, actionName) => setKwPicker({ kind: 'save', dc, saveType, actionName, targets: new Set() })}
          />
        </div>
      )}

      {/* Compact mode: inline stat block below */}
      {selected && compact && (
        <div key={selected.id} className="animate-fade-in" style={{ gridColumn: '1 / -1' }}>
          <StatBlock
            monster={selected}
            onAddToCombat={onAddToCombat}
            campaignId={campaignId}
            partyChars={partyChars}
            onKwDamage={(dice, dmgType, actionName) => setKwPicker({ kind: 'damage', dice, dmgType, actionName, targets: new Set() })}
            onKwSave={(dc, saveType, actionName) => setKwPicker({ kind: 'save', dc, saveType, actionName, targets: new Set() })}
          />
        </div>
      )}

      {/* v2.177.0 — Phase Q.0 pt 18: interactive keyword target picker.
          Modal is shared between damage and save flows since the UI is
          the same (pick targets, click Apply/Send). The difference is
          the confirm handler. */}
      {kwPicker && (
        <div
          onClick={() => setKwPicker(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, gridColumn: '1 / -1',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--c-card)', borderRadius: 12,
              border: `1px solid ${kwPicker.kind === 'damage' ? 'rgba(248,113,113,0.5)' : 'rgba(167,139,250,0.5)'}`,
              maxWidth: 560, width: '100%', padding: 20,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: kwPicker.kind === 'damage' ? '#f87171' : '#a78bfa', marginBottom: 4 }}>
                {kwPicker.kind === 'damage' ? 'Apply Damage' : 'Broadcast Save Prompt'} — {kwPicker.actionName}
              </div>
              <h3 style={{ margin: 0, fontSize: 18, color: 'var(--t-1)' }}>
                {kwPicker.kind === 'damage'
                  ? `${kwPicker.dice}${kwPicker.dmgType ? ` ${kwPicker.dmgType}` : ''} damage`
                  : `DC ${kwPicker.dc} ${kwPicker.saveType} save`}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
                {kwPicker.kind === 'damage'
                  ? 'Damage is rolled when you click Apply. Temp HP absorbs first per RAW, then current HP reduces. This is a "just apply it" shortcut — use Full Combat for attack rolls, saves, resistances.'
                  : 'Sends a save prompt only to the selected players. Their sheets show the DC + their modifier + Roll button. Results route through the standard save-roll pipeline.'}
              </p>
            </div>

            {/* Target chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {partyChars.map(c => {
                const sel = kwPicker.targets.has(c.id);
                const accent = kwPicker.kind === 'damage' ? '#f87171' : '#a78bfa';
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      const next = new Set(kwPicker.targets);
                      if (sel) next.delete(c.id); else next.add(c.id);
                      setKwPicker({ ...kwPicker, targets: next });
                    }}
                    style={{
                      fontSize: 11, fontWeight: sel ? 700 : 500, padding: '5px 12px', borderRadius: 999,
                      cursor: 'pointer', minHeight: 0,
                      border: `1px solid ${sel ? accent : 'var(--c-border-m)'}`,
                      background: sel ? `${accent}1f` : 'var(--c-raised)',
                      color: sel ? accent : 'var(--t-2)',
                    }}
                  >
                    {sel ? '✓ ' : ''}{c.name}
                  </button>
                );
              })}
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button
                onClick={() => setKwPicker(null)}
                style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                  border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-2)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => kwPicker.kind === 'damage' ? applyKeywordDamage() : broadcastKeywordSave()}
                disabled={kwPicker.targets.size === 0}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: kwPicker.targets.size === 0 ? 'not-allowed' : 'pointer', minHeight: 0,
                  border: `1px solid ${kwPicker.kind === 'damage' ? 'rgba(248,113,113,0.5)' : 'rgba(167,139,250,0.5)'}`,
                  background: kwPicker.kind === 'damage' ? 'rgba(248,113,113,0.15)' : 'rgba(167,139,250,0.15)',
                  color: kwPicker.kind === 'damage' ? '#f87171' : '#a78bfa',
                  opacity: kwPicker.targets.size === 0 ? 0.4 : 1,
                }}
              >
                {kwPicker.kind === 'damage'
                  ? `Roll & Apply to ${kwPicker.targets.size || 'N'}`
                  : `Send Save to ${kwPicker.targets.size || 'N'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v2.177.0 — flash toast for keyword feedback */}
      {kwFlash && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 210,
          padding: '10px 18px', borderRadius: 8,
          background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.45)',
          color: '#4ade80', fontSize: 13, fontWeight: 700,
          gridColumn: '1 / -1',
        }}>
          {kwFlash}
        </div>
      )}
    </div>
  );
}

function StatBlock({
  monster: m, onAddToCombat,
  campaignId, partyChars, onKwDamage, onKwSave,
}: {
  monster: MonsterData;
  onAddToCombat?: (m: MonsterData) => void;
  // v2.177.0 — Phase Q.0 pt 18: interactive keyword props. When
  // campaignId + partyChars are provided, damage/DC pills become
  // clickable buttons that invoke the parent's target-picker
  // callbacks. Undefined = plain display pills (bestiary for
  // players, or DM without a campaign).
  campaignId?: string | null;
  partyChars?: Character[];
  onKwDamage?: (dice: string, dmgType: string | undefined, actionName: string) => void;
  onKwSave?: (dc: number, saveType: string, actionName: string) => void;
}) {
  const xpLabel = m.xp >= 1000 ? `${(m.xp / 1000).toFixed(1)}k` : String(m.xp);
  const speedStr = [
    m.speed ? `${m.speed} ft.` : '',
    m.fly_speed ? `fly ${m.fly_speed} ft.` : '',
    m.swim_speed ? `swim ${m.swim_speed} ft.` : '',
    m.climb_speed ? `climb ${m.climb_speed} ft.` : '',
    m.burrow_speed ? `burrow ${m.burrow_speed} ft.` : '',
  ].filter(Boolean).join(', ');

  const savesStr = m.saving_throws
    ? Object.entries(m.saving_throws).map(([k,v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')
    : null;
  const skillsStr = m.skills
    ? Object.entries(m.skills).map(([k,v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')
    : null;
  const immunities = m.damage_immunities?.join(', ');
  const resistances = m.damage_resistances?.join(', ');
  const condImm = m.condition_immunities?.join(', ');
  const sensesStr = m.senses
    ? Object.entries(m.senses).filter(([k]) => k !== 'passive_perception')
        .map(([k, v]) => `${k.replace(/_/g,' ')} ${v}`).join(', ')
        + (m.senses.passive_perception ? `, Passive Perception ${m.senses.passive_perception}` : '')
    : null;

  return (
    <div style={{ fontFamily: 'var(--ff-body)', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 12, overflow: 'hidden', maxHeight: '80vh', overflowY: 'auto' }}>
      {/* Header — red DnD stat block style */}
      <div style={{ background: 'rgba(139,0,0,0.15)', borderBottom: '2px solid var(--c-gold)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-1)' }}>{m.name}</div>
            <div style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--t-2)', marginTop: 2 }}>
              {m.size} {m.type}{m.subtype ? ` (${m.subtype})` : ''}{m.alignment ? `, ${m.alignment}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* v2.142.0 — Phase M pt 5: ruleset badge — makes it visible
                at a glance which edition the stat block comes from.
                Amber for 2014, green for 2024, grey for null (homebrew
                without declared version). */}
            {m.ruleset_version && (() => {
              const rv = m.ruleset_version;
              const rvColor = rv === '2024' ? '#34d399' : '#f59e0b';
              return (
                <span style={{
                  fontWeight: 800, fontSize: 10, color: rvColor,
                  background: `${rvColor}18`, border: `1px solid ${rvColor}55`,
                  borderRadius: 999, padding: '2px 8px',
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                }}>{rv}</span>
              );
            })()}
            <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--c-gold-l)', background: 'rgba(201,146,42,0.15)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '2px 10px' }}>CR {formatCR(m.cr)}</span>
            <span style={{ fontSize: 11, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 8px' }}>{xpLabel} XP</span>
            {onAddToCombat && (
              <button className="btn-gold btn-sm" onClick={() => onAddToCombat(m)} style={{ fontSize: 11 }}>+ Combat</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Core defense row */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
          <SBStat label="Armor Class" value={`${m.ac}${m.ac_note ? ` (${m.ac_note})` : ''}`}/>
          <SBStat label="Hit Points" value={`${m.hp} (${m.hp_formula})`}/>
          <SBStat label="Speed" value={speedStr || `${m.speed} ft.`}/>
        </div>

        {/* Ability scores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, textAlign: 'center', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
          {(['STR','DEX','CON','INT','WIS','CHA'] as const).map((label, i) => {
            const score = [m.str, m.dex, m.con, m.int, m.wis, m.cha][i];
            const sv = m.saving_throws?.[label];
            return (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-3)', letterSpacing: '0.1em' }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-1)', fontFamily: 'var(--ff-stat)' }}>{score}</div>
                <div style={{ fontSize: 10, color: 'var(--c-gold-l)' }}>{mod(score)}</div>
                {sv !== undefined && <div style={{ fontSize: 9, color: '#34d399' }}>Save {sv >= 0 ? '+' : ''}{sv}</div>}
              </div>
            );
          })}
        </div>

        {/* Secondary stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 10, borderBottom: '1px solid var(--c-border)', fontSize: 12 }}>
          {skillsStr && <SBStat label="Skills" value={skillsStr}/>}
          {immunities && <SBStat label="Damage Immunities" value={immunities}/>}
          {resistances && <SBStat label="Resistances" value={resistances}/>}
          {condImm && <SBStat label="Condition Immunities" value={condImm}/>}
          {sensesStr && <SBStat label="Senses" value={sensesStr}/>}
          {m.languages && <SBStat label="Languages" value={m.languages}/>}
        </div>

        {/* Traits */}
        {m.traits && m.traits.length > 0 && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            {m.traits.map(t => {
              // v2.141.0 — Phase M pt 4: surface the LR charge count inline
              // with the Legendary Resistance trait entry. The trait's desc
              // text doesn't include the "3/Day" count in SRD 2014 imports
              // so without this badge the DM has no visual cue of how many
              // charges the monster actually has. Read directly from
              // legendary_resistance_count (backfilled in v2.138).
              const isLrTrait = t.name === 'Legendary Resistance';
              const showLrBadge = isLrTrait && (m.legendary_resistance_count ?? 0) > 0;
              return (
                <div key={t.name} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-1)' }}>{t.name}</span>
                  {showLrBadge && (
                    <span style={{
                      marginLeft: 6,
                      fontSize: 9, fontWeight: 800,
                      padding: '1px 6px', borderRadius: 999,
                      color: 'var(--c-gold-l)',
                      background: 'rgba(212,160,23,0.12)',
                      border: '1px solid var(--c-gold-bdr)',
                      letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                      verticalAlign: 'middle',
                    }}>
                      🛡 {m.legendary_resistance_count}/Day
                    </span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-1)' }}>. </span>
                  <span style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{t.desc}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {m.actions && m.actions.length > 0 ? (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#f87171', marginBottom: 8 }}>Actions</div>
            {m.actions.map(a => (
              <div key={a.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{a.name}</span>
                  {a.attack_bonus !== undefined && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                      +{a.attack_bonus} to hit
                    </span>
                  )}
                  {a.damage_dice && (
                    campaignId && partyChars && partyChars.length > 0 && onKwDamage ? (
                      <button
                        onClick={() => onKwDamage(a.damage_dice!, a.damage_type, a.name)}
                        title={`Apply ${a.damage_dice}${a.damage_type ? ` ${a.damage_type}` : ''} to party members`}
                        style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.5)', borderRadius: 999, padding: '2px 8px', cursor: 'pointer', minHeight: 0 }}
                      >
                        ⚔ {a.damage_dice} {a.damage_type}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                        {a.damage_dice} {a.damage_type}
                      </span>
                    )
                  )}
                  {a.bonus_damage_dice && (
                    campaignId && partyChars && partyChars.length > 0 && onKwDamage ? (
                      <button
                        onClick={() => onKwDamage(a.bonus_damage_dice!, a.bonus_damage_type, `${a.name} (rider)`)}
                        title={`Apply ${a.bonus_damage_dice}${a.bonus_damage_type ? ` ${a.bonus_damage_type}` : ''} rider damage`}
                        style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.5)', borderRadius: 999, padding: '2px 8px', cursor: 'pointer', minHeight: 0 }}
                      >
                        ⚔ +{a.bonus_damage_dice} {a.bonus_damage_type}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                        +{a.bonus_damage_dice} {a.bonus_damage_type}
                      </span>
                    )
                  )}
                  {a.dc_type && (
                    campaignId && partyChars && partyChars.length > 0 && onKwSave && a.dc_value ? (
                      <button
                        onClick={() => onKwSave(a.dc_value!, a.dc_type!, a.name)}
                        title={`Prompt party for DC ${a.dc_value} ${a.dc_type} save`}
                        style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.5)', borderRadius: 999, padding: '2px 8px', cursor: 'pointer', minHeight: 0 }}
                      >
                        🎲 DC {a.dc_value} {a.dc_type}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                        DC {a.dc_value} {a.dc_type}
                      </span>
                    )
                  )}
                  {a.usage && <span style={{ fontSize: 9, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 5px' }}>{a.usage}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback to legacy attack fields */
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#f87171', marginBottom: 6 }}>Actions</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{m.attack_name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>+{m.attack_bonus} to hit</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 999, padding: '1px 6px' }}>{m.attack_damage}</span>
            </div>
          </div>
        )}

        {/* Reactions */}
        {m.reactions && m.reactions.length > 0 && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#34d399', marginBottom: 8 }}>Reactions</div>
            {m.reactions.map(r => (
              <div key={r.name} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-1)' }}>{r.name}. </span>
                <span style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{r.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legendary Actions */}
        {m.legendary_actions && m.legendary_actions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#c084fc', marginBottom: 8 }}>
              {/* v2.141.0 — Phase M pt 4: LR is now surfaced on the
                  Legendary Resistance TRAIT with its own charge badge
                  (see traits render above). Previously this header read
                  "Legendary Actions (3/Day)" which was confusing — that
                  count describes LR per day, not LA per round. Header
                  now just says "Legendary Actions". */}
              Legendary Actions
            </div>
            {m.legendary_actions.map(la => (
              <div key={la.name} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#c084fc' }}>{la.name}{la.cost && la.cost > 1 ? ` (Costs ${la.cost})` : ''}. </span>
                <span style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{la.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* v2.94.0 — Phase B: attribution footer */}
        {(m.attribution_text || m.license_key) && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px dashed var(--c-border)',
            fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)',
            lineHeight: 1.5, fontStyle: 'italic',
          }}>
            {m.attribution_text ?? (m.license_key === 'homebrew' ? 'Homebrew content — created by a DNDKeep user.' : '')}
          </div>
        )}
      </div>
    </div>
  );
}

function SBStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: 'var(--t-1)' }}>{label}: </span>
      <span style={{ color: 'var(--t-2)' }}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--t-1)' }}>
        {label}{' '}
      </span>
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{value}</span>
    </div>
  );
}
