import { useState } from 'react';
import type { Campaign, AutomationSettings } from '../../types';
import { supabase } from '../../lib/supabase';
import { AUTOMATIONS, labelForValue, type AutomationValue } from '../../lib/automations';

// v2.165.0 — Phase Q.0 pt 6: Campaign Settings reorg with tabs.
//
// Restructured the previously-flat settings modal into three top-level
// tabs because the modal had grown long enough to require scrolling
// past unrelated sections to reach common controls:
//
//   • Automation — the registry-driven Rule Automations from
//     lib/automations.ts (5 entries: concentration check on damage,
//     opportunity attacks, condition cascade, absorb elements rider,
//     death saves at turn start). This is the structured three-tier
//     override system (off / prompt / auto) that supports
//     character-level overrides.
//   • Rules — game-engine behavior toggles (the 4 legacy automations
//     that predate the registry: hit dice, damage dice, damage done,
//     condition tracker), plus Encumbrance variant at the bottom (a
//     rare-use toggle that most tables won't enable).
//   • Danger Zone — Delete Campaign with typed-name confirmation.
//     Same flow as before, just isolated on its own tab so it can't
//     be hit accidentally while scrolling settings.
//
// The 4 legacy toggles live in `automation_settings` (column on
// campaigns table); the new registry overrides live in
// `automation_defaults` (jsonb). Both columns persist independently.

interface Props {
  campaign: Campaign;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (updates: Partial<Campaign>) => void;
}

const DEFAULT_AUTOMATION: AutomationSettings = {
  auto_hit_dice: true,
  auto_damage_dice: true,
  auto_damage_done: false,
  auto_condition_tracker: true,
};

// Renamed in the UI to "Quick Rules" since these aren't structured
// automations — they're simple boolean toggles for whether engine
// shortcuts auto-apply. Kept the AutomationSettings type/key names
// for backward DB compatibility.
const QUICK_RULES_OPTIONS: { key: keyof AutomationSettings; label: string; desc: string }[] = [
  {
    key: 'auto_hit_dice',
    label: 'Automate Hit Dice',
    desc: 'When a player rolls a hit die during a short rest, the HP recovery is automatically applied and the spent die is tracked.',
  },
  {
    key: 'auto_damage_dice',
    label: 'Automate Damage Dice',
    desc: 'Clicking a damage button rolls the dice through the 3D dice roller and logs the result to the action log automatically.',
  },
  {
    key: 'auto_damage_done',
    label: 'Automate Damage Done',
    desc: 'When a player confirms a hit on a target, the damage is automatically subtracted from the target\'s HP in the party tracker.',
  },
  {
    key: 'auto_condition_tracker',
    label: 'Automate Condition Tracker',
    desc: 'Conditions applied during combat (Poisoned, Frightened, etc.) automatically show their mechanical penalties on the character sheet.',
  },
];

type Tab = 'automation' | 'rules' | 'danger';

export default function CampaignSettings({ campaign, onClose, onDeleted, onUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('automation');

  // Danger zone state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Quick Rules (legacy automation_settings)
  const [automation, setAutomation] = useState<AutomationSettings>(
    campaign.automation_settings ?? DEFAULT_AUTOMATION
  );
  const [savingAuto, setSavingAuto] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  // Automation framework (registry-driven defaults)
  const [automationDefaults, setAutomationDefaults] = useState<Record<string, AutomationValue>>(
    (campaign.automation_defaults as Record<string, AutomationValue> | undefined) ?? {}
  );

  // Encumbrance variant
  const [encumbranceVariant, setEncumbranceVariant] = useState<'off' | 'base' | 'variant'>(
    (campaign.encumbrance_variant ?? 'off') as 'off' | 'base' | 'variant'
  );
  const [savingEnc, setSavingEnc] = useState(false);
  const [encSaved, setEncSaved] = useState(false);

  // v2.173.0 — Phase Q.0 pt 14: Award XP toggle
  const [awardXpEnabled, setAwardXpEnabled] = useState<boolean>(!!campaign.award_xp_enabled);
  const [savingXp, setSavingXp] = useState(false);
  const [xpSaved, setXpSaved] = useState(false);

  // v2.314.0 — Combat Phase 3: BattleMap path toggle. When true, the
  // BattleMap reads/writes through scene_token_placements +
  // combatants. When false (default), the legacy scene_tokens path
  // is used. Reload required for the change to take effect. Marked
  // BETA in the UI because the new path has documented gaps (e.g.,
  // multi-client rename propagation requires v2.314's combatants
  // realtime subscription which lands in this same ship).
  const [usePhase3, setUsePhase3] = useState<boolean>(!!campaign.use_combatants_for_battlemap);
  const [savingPhase3, setSavingPhase3] = useState(false);
  const [phase3Saved, setPhase3Saved] = useState(false);

  async function saveUsePhase3(next: boolean) {
    setSavingPhase3(true);
    setUsePhase3(next);
    // supabase types lag the live schema for use_combatants_for_battlemap
    // (added in v2.312); cast to bypass strict column checking. Same
    // pattern as src/lib/api/scenePlacements.ts. See v2.315 cleanup
    // for type regen.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('campaigns')
      .update({ use_combatants_for_battlemap: next })
      .eq('id', campaign.id);
    setSavingPhase3(false);
    if (!error) {
      onUpdated({ use_combatants_for_battlemap: next });
      setPhase3Saved(true);
      setTimeout(() => setPhase3Saved(false), 2000);
    }
  }

  async function saveAwardXpEnabled(next: boolean) {
    setSavingXp(true);
    setAwardXpEnabled(next);
    const { error } = await supabase
      .from('campaigns')
      .update({ award_xp_enabled: next })
      .eq('id', campaign.id);
    setSavingXp(false);
    if (!error) {
      onUpdated({ award_xp_enabled: next });
      setXpSaved(true);
      setTimeout(() => setXpSaved(false), 2000);
    }
  }

  async function saveEncumbranceVariant(next: 'off' | 'base' | 'variant') {
    setSavingEnc(true);
    setEncumbranceVariant(next);
    const { error } = await supabase
      .from('campaigns')
      .update({ encumbrance_variant: next })
      .eq('id', campaign.id);
    setSavingEnc(false);
    if (!error) {
      onUpdated({ encumbrance_variant: next });
      setEncSaved(true);
      setTimeout(() => setEncSaved(false), 2000);
    }
  }

  async function saveAutomationDefaults(next: Record<string, AutomationValue>) {
    setSavingAuto(true);
    const { error } = await supabase
      .from('campaigns')
      .update({ automation_defaults: next })
      .eq('id', campaign.id);
    setSavingAuto(false);
    if (!error) {
      onUpdated({ automation_defaults: next });
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    }
  }

  function setAutomationDefault(key: string, value: AutomationValue | null) {
    const next = { ...automationDefaults };
    if (value === null) delete next[key];
    else next[key] = value;
    setAutomationDefaults(next);
    saveAutomationDefaults(next);
  }

  async function saveQuickRules(newSettings: AutomationSettings) {
    setSavingAuto(true);
    const { error } = await supabase
      .from('campaigns')
      .update({ automation_settings: newSettings })
      .eq('id', campaign.id);
    setSavingAuto(false);
    if (!error) {
      onUpdated({ automation_settings: newSettings });
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    }
  }

  function toggleQuickRule(key: keyof AutomationSettings) {
    const updated = { ...automation, [key]: !automation[key] };
    setAutomation(updated);
    saveQuickRules(updated);
  }

  // v2.171.0 — Phase Q.0 pt 12: delete path simplified + hardened.
  // Previously we ran an explicit `characters.update({campaign_id: null})`
  // pre-step to "detach" characters. That pre-step can fail silently
  // under RLS (DM doesn't own player characters, so update returns 0
  // rows but no error), but also is redundant — the `characters_campaign_id_fkey`
  // FK is ON DELETE SET NULL, so characters are preserved automatically
  // when the campaign row is deleted. Dropping the pre-step removes the
  // silent-fail surface area.
  //
  // Also: if the delete returns `error`, we now surface the full
  // Supabase message (code + hint + details) so a broken delete is
  // visible instead of "Failed to delete campaign".
  async function deleteCampaign() {
    // Case-insensitive + trimmed name match — the intent check is
    // "did you type this on purpose", not "can you match capitalization".
    if (confirmText.trim().toLowerCase() !== campaign.name.trim().toLowerCase()) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaign.id);

      if (error) {
        // Surface as much detail as Supabase gives us.
        const parts = [error.message, error.code && `(code: ${error.code})`, error.hint && `hint: ${error.hint}`].filter(Boolean);
        throw new Error(parts.join(' '));
      }
      // Reset modal state before navigating so we don't flash stale
      // confirmation UI if the parent remounts us.
      setConfirmDelete(false);
      setConfirmText('');
      onDeleted();
    } catch (e: any) {
      setDeleteError(e.message ?? 'Failed to delete campaign');
      setDeleting(false);
    }
  }

  const savedFlash = (
    <>
      {savingAuto && <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400 }}>Saving…</span>}
      {autoSaved && <span style={{ fontSize: 9, color: '#34d399', fontWeight: 400 }}>✓ Saved</span>}
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        // v2.168.0 — bumped from 640→720 and added inline padding. The
        // .modal class has `overflow: hidden` with no inner padding, so
        // prior to this the h3 title ("Campaign Settings") sat flush to
        // the left edge (clipping the "C") and the Close button ran off
        // the right. Matches the pattern used by SessionScheduler (760)
        // after v2.164. Keeps width:92vw for mobile.
        style={{ maxWidth: 720, width: '92vw', padding: '20px 24px' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 4 }}>Campaign Settings</h3>
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)', marginBottom: 16 }}>
          {campaign.name}
        </p>

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 18,
          borderBottom: '1px solid var(--c-border)',
        }}>
          {([
            { id: 'automation', label: 'Automation' },
            { id: 'rules', label: 'Rules' },
            { id: 'danger', label: 'Danger Zone', accent: 'red' },
          ] as { id: Tab; label: string; accent?: 'red' }[]).map(t => {
            const active = tab === t.id;
            const isRed = t.accent === 'red';
            const activeColor = isRed ? 'var(--c-red-l)' : 'var(--c-gold-l)';
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                  padding: '8px 16px', cursor: 'pointer',
                  border: 'none', background: 'transparent',
                  color: active ? activeColor : 'var(--t-3)',
                  borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
                  marginBottom: -1, // overlap the container border
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div style={{ minHeight: 320, maxHeight: 'calc(80vh - 200px)', overflowY: 'auto', paddingRight: 4 }}>

          {/* AUTOMATION TAB — registry-driven Rule Automations */}
          {tab === 'automation' && (
            <div>
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                color: 'var(--c-gold-l)', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                Rule Automations {savedFlash}
              </div>
              <p style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 14 }}>
                Set the default behavior for rule automations campaign-wide. Players can override these on their own characters if they unlock custom automations.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {AUTOMATIONS.map(auto => {
                  const current = automationDefaults[auto.key] ?? auto.default;
                  const isBuiltIn = automationDefaults[auto.key] === undefined;
                  return (
                    <div key={auto.key} style={{ padding: '10px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-raised)' }}>
                      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)', marginBottom: 2 }}>
                        {auto.label}
                      </div>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 8 }}>
                        {auto.description}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {auto.allowed.map(v => {
                          const selected = current === v;
                          return (
                            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: `1px solid ${selected ? 'var(--c-gold)' : 'var(--c-border)'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', background: selected ? 'rgba(201,146,42,0.12)' : 'transparent' }}>
                              <input
                                type="radio"
                                name={`default-${auto.key}`}
                                checked={selected}
                                onChange={() => setAutomationDefault(auto.key, v)}
                              />
                              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700, color: selected ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                                {labelForValue(v)}
                              </span>
                            </label>
                          );
                        })}
                        {isBuiltIn && (
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', alignSelf: 'center', marginLeft: 'auto' }}>
                            (using built-in default)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RULES TAB — engine-behavior toggles + encumbrance at bottom */}
          {tab === 'rules' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Quick Rules — engine shortcuts */}
              <div>
                <div style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                  color: 'var(--c-gold-l)', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  Quick Rules {savedFlash}
                </div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 12 }}>
                  Engine shortcuts that auto-apply during play. Toggle off if you prefer to handle these manually.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {QUICK_RULES_OPTIONS.map(({ key, label, desc }) => {
                    const enabled = automation[key];
                    return (
                      <div
                        key={key}
                        onClick={() => toggleQuickRule(key)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                          border: `1px solid ${enabled ? 'rgba(52,211,153,0.35)' : 'var(--c-border)'}`,
                          background: enabled ? 'rgba(52,211,153,0.05)' : 'var(--c-raised)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                          border: `2px solid ${enabled ? '#34d399' : 'var(--c-border-m)'}`,
                          background: enabled ? '#34d399' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {enabled && (
                            <span style={{ color: '#000', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
                            color: enabled ? 'var(--t-1)' : 'var(--t-2)',
                            marginBottom: 2,
                          }}>
                            {label}
                          </div>
                          <div style={{
                            fontFamily: 'var(--ff-body)', fontSize: 11,
                            color: 'var(--t-3)', lineHeight: 1.5,
                          }}>
                            {desc}
                          </div>
                        </div>
                        <div style={{
                          flexShrink: 0, fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                          padding: '2px 8px', borderRadius: 999,
                          background: enabled ? 'rgba(52,211,153,0.15)' : 'var(--c-card)',
                          color: enabled ? '#34d399' : 'var(--t-3)',
                          border: `1px solid ${enabled ? 'rgba(52,211,153,0.3)' : 'var(--c-border)'}`,
                        }}>
                          {enabled ? 'ON' : 'OFF'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Encumbrance — at the bottom per user spec, since it's
                  a rarely-enabled optional rule. */}
              <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', background: 'var(--c-surface-1)' }}>
                <div style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                  color: 'var(--c-gold-l)', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  Encumbrance
                  {savingEnc && <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400 }}>Saving…</span>}
                  {encSaved && <span style={{ fontSize: 9, color: '#34d399', fontWeight: 400 }}>✓ Saved</span>}
                  <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400, marginLeft: 'auto', fontStyle: 'italic' as const }}>
                    optional rule
                  </span>
                </div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 12 }}>
                  When a character's carried weight exceeds their capacity, automatically apply the Encumbered condition (speed halved, disadvantage on STR/DEX/CON rolls).
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    { value: 'off',     label: 'Off',                 desc: 'No auto-application. Track weight manually if at all.' },
                    { value: 'base',    label: 'Base (RAW 2024)',     desc: 'Encumbered when carried weight > STR × 15 lbs.' },
                    { value: 'variant', label: 'Variant (3-tier)',    desc: 'Encumbered at > STR × 5 (mild). Heavily encumbered at > STR × 10. Optional rule.' },
                  ] as const).map(({ value, label, desc }) => {
                    const active = encumbranceVariant === value;
                    return (
                      <div
                        key={value}
                        onClick={() => saveEncumbranceVariant(value)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                          border: `1px solid ${active ? 'rgba(212,160,23,0.45)' : 'var(--c-border)'}`,
                          background: active ? 'rgba(212,160,23,0.06)' : 'var(--c-raised)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                          border: `2px solid ${active ? 'var(--c-gold-l)' : 'var(--c-border-m)'}`,
                          background: active ? 'var(--c-gold-l)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && (
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#000' }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
                            color: active ? 'var(--t-1)' : 'var(--t-2)',
                            marginBottom: 2,
                          }}>
                            {label}
                          </div>
                          <div style={{
                            fontFamily: 'var(--ff-body)', fontSize: 11,
                            color: 'var(--t-3)', lineHeight: 1.5,
                          }}>
                            {desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* v2.173.0 — Phase Q.0 pt 14: Award XP toggle. Gates the
                  XP panel in the Party Dashboard. Most tables run on
                  milestone leveling and don't want the XP clutter, so
                  this defaults OFF. Enable here to surface it. */}
              <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', background: 'var(--c-surface-1)' }}>
                <div style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                  color: 'var(--c-gold-l)', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  XP Leveling
                  {savingXp && <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400 }}>Saving…</span>}
                  {xpSaved && <span style={{ fontSize: 9, color: '#34d399', fontWeight: 400 }}>✓ Saved</span>}
                </div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 12 }}>
                  Enable the Award XP panel in the Party Dashboard DM Controls. Leave off for milestone leveling — the panel stays hidden and the tab disappears from the DM bar.
                </p>
                <div
                  onClick={() => saveAwardXpEnabled(!awardXpEnabled)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    border: `1px solid ${awardXpEnabled ? 'rgba(212,160,23,0.45)' : 'var(--c-border)'}`,
                    background: awardXpEnabled ? 'rgba(212,160,23,0.06)' : 'var(--c-raised)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 36, height: 20, borderRadius: 999, flexShrink: 0,
                    background: awardXpEnabled ? 'var(--c-gold-l)' : 'var(--c-border-m)',
                    position: 'relative' as const, transition: 'background 0.15s',
                  }}>
                    <div style={{
                      position: 'absolute' as const, top: 2, left: awardXpEnabled ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.15s',
                    }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: awardXpEnabled ? 'var(--t-1)' : 'var(--t-2)' }}>
                      {awardXpEnabled ? 'Award XP enabled' : 'Award XP disabled (milestone leveling)'}
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
                      {awardXpEnabled
                        ? 'DM can award XP to the party or specific players from the Party Dashboard.'
                        : 'XP panel hidden from DM Controls. Levels advance via milestones set by the DM.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* v2.314.0 — Combat Phase 3 BattleMap path toggle. The
                  legacy scene_tokens path is the default; opting in
                  routes the BattleMap through scene_token_placements
                  + combatants for persistent creature identity across
                  scenes and encounters. Reload required after toggle.
                  Marked BETA — multi-client rename and combat HP
                  realtime propagation work via the v2.314 combatants
                  channel; deeper combat-code integration lands in
                  v2.315. */}
              <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', background: 'var(--c-surface-1)' }}>
                <div style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                  color: 'var(--c-gold-l)', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  BattleMap Engine
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    borderRadius: 4, background: 'rgba(139,92,246,0.15)',
                    color: '#a78bfa', letterSpacing: '0.08em',
                  }}>BETA</span>
                  {savingPhase3 && <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400 }}>Saving…</span>}
                  {phase3Saved && <span style={{ fontSize: 9, color: '#34d399', fontWeight: 400 }}>✓ Saved · reload to apply</span>}
                </div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 12 }}>
                  Switches the BattleMap to the new combatants + placements engine. Tokens become persistent creature instances that carry HP and conditions across scenes and combat encounters. Reload the BattleMap after toggling.
                </p>
                <div
                  onClick={() => saveUsePhase3(!usePhase3)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    border: `1px solid ${usePhase3 ? 'rgba(212,160,23,0.45)' : 'var(--c-border)'}`,
                    background: usePhase3 ? 'rgba(212,160,23,0.06)' : 'var(--c-raised)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 36, height: 20, borderRadius: 999, flexShrink: 0,
                    background: usePhase3 ? 'var(--c-gold-l)' : 'var(--c-border-m)',
                    position: 'relative' as const, transition: 'background 0.15s',
                  }}>
                    <div style={{
                      position: 'absolute' as const, top: 2, left: usePhase3 ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.15s',
                    }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: usePhase3 ? 'var(--t-1)' : 'var(--t-2)' }}>
                      {usePhase3 ? 'Combatants engine on' : 'Legacy scene_tokens engine'}
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
                      {usePhase3
                        ? 'BattleMap reads/writes through scene_token_placements + combatants. Per-creature identity persists across scenes and encounters.'
                        : 'BattleMap reads/writes through scene_tokens. Each placement is independent; HP/conditions reset between encounters.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DANGER ZONE TAB — delete campaign with typed-name confirmation */}
          {tab === 'danger' && (
            <div style={{
              padding: '14px 16px', borderRadius: 'var(--r-lg)',
              border: '1px solid rgba(239,68,68,0.25)',
              background: 'rgba(239,68,68,0.03)',
            }}>
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                color: 'var(--c-red-l)', marginBottom: 8,
              }}>
                ⚠ Danger Zone
              </div>

              {!confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 13, color: 'var(--t-1)', marginBottom: 2 }}>
                      Delete Campaign
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
                      Permanently removes the campaign, all logs, and NPC data. Characters are kept but unlinked.
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, padding: '6px 14px',
                      borderRadius: 'var(--r-md)', cursor: 'pointer', flexShrink: 0,
                      border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)',
                      color: 'var(--c-red-l)',
                    }}
                  >
                    Delete Campaign
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>
                    This <strong style={{ color: 'var(--c-red-l)' }}>cannot be undone</strong>. Type the campaign name to confirm:
                    <br /><strong style={{ color: 'var(--t-1)' }}>{campaign.name}</strong>
                  </div>
                  <input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={`Type "${campaign.name}" to confirm`}
                    autoFocus
                    style={{ fontSize: 13, borderColor: confirmText.trim().toLowerCase() === campaign.name.trim().toLowerCase() ? 'rgba(239,68,68,0.5)' : undefined }}
                    onKeyDown={e => { if (e.key === 'Escape') { setConfirmDelete(false); setConfirmText(''); } }}
                  />
                  {deleteError && (
                    <div style={{ fontSize: 11, color: 'var(--c-red-l)', fontFamily: 'var(--ff-body)' }}>
                      {deleteError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => { setConfirmDelete(false); setConfirmText(''); }}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Cancel
                    </button>
                    <button
                      disabled={confirmText.trim().toLowerCase() !== campaign.name.trim().toLowerCase() || deleting}
                      onClick={deleteCampaign}
                      style={{
                        flex: 1, fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
                        padding: '7px 14px', borderRadius: 'var(--r-md)', cursor: confirmText.trim().toLowerCase() === campaign.name.trim().toLowerCase() ? 'pointer' : 'not-allowed',
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: confirmText.trim().toLowerCase() === campaign.name.trim().toLowerCase() ? 'rgba(239,68,68,0.2)' : 'transparent',
                        color: confirmText.trim().toLowerCase() === campaign.name.trim().toLowerCase() ? 'var(--c-red-l)' : 'var(--t-3)',
                        opacity: deleting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      {deleting ? 'Deleting…' : 'Permanently Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
