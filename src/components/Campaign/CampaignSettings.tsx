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

  async function deleteCampaign() {
    if (confirmText !== campaign.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Detach characters from campaign first so they aren't lost
      // by the cascade.
      await supabase
        .from('characters')
        .update({ campaign_id: null })
        .eq('campaign_id', campaign.id);

      // Delete campaign (cascades via FK to members, logs, etc.)
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaign.id);

      if (error) throw error;
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
                    style={{ fontSize: 13, borderColor: confirmText === campaign.name ? 'rgba(239,68,68,0.5)' : undefined }}
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
                      disabled={confirmText !== campaign.name || deleting}
                      onClick={deleteCampaign}
                      style={{
                        flex: 1, fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
                        padding: '7px 14px', borderRadius: 'var(--r-md)', cursor: confirmText === campaign.name ? 'pointer' : 'not-allowed',
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: confirmText === campaign.name ? 'rgba(239,68,68,0.2)' : 'transparent',
                        color: confirmText === campaign.name ? 'var(--c-red-l)' : 'var(--t-3)',
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
