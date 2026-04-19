import { useState } from 'react';
import type { Campaign, AutomationSettings } from '../../types';
import { supabase } from '../../lib/supabase';
import { AUTOMATIONS, labelForValue, type AutomationValue } from '../../lib/automations';

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

const AUTOMATION_OPTIONS: { key: keyof AutomationSettings; label: string; desc: string }[] = [
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

export default function CampaignSettings({ campaign, onClose, onDeleted, onUpdated }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings>(
    campaign.automation_settings ?? DEFAULT_AUTOMATION
  );
  const [savingAuto, setSavingAuto] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  // v2.26.0 — automation framework defaults (separate from legacy automation_settings)
  const [automationDefaults, setAutomationDefaults] = useState<Record<string, AutomationValue>>(
    (campaign.automation_defaults as Record<string, AutomationValue> | undefined) ?? {}
  );

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

  async function saveAutomation(newSettings: AutomationSettings) {
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

  function toggleAuto(key: keyof AutomationSettings) {
    const updated = { ...automation, [key]: !automation[key] };
    setAutomation(updated);
    saveAutomation(updated);
  }

  async function deleteCampaign() {
    if (confirmText !== campaign.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Detach characters from campaign first
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 4 }}>⚙️ Campaign Settings</h3>{/* cs-v2 */}
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)', marginBottom: 20 }}>
          {campaign.name}
        </p>

        {/* ── Automation Settings ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: 'var(--c-gold-l)', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            🤖 Automation
            {savingAuto && <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400 }}>Saving…</span>}
            {autoSaved && <span style={{ fontSize: 9, color: '#34d399', fontWeight: 400 }}>✓ Saved</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AUTOMATION_OPTIONS.map(({ key, label, desc }) => {
              const enabled = automation[key];
              return (
                <div
                  key={key}
                  onClick={() => toggleAuto(key)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    border: `1px solid ${enabled ? 'rgba(52,211,153,0.3)' : 'var(--c-border)'}`,
                    background: enabled ? 'rgba(52,211,153,0.04)' : 'var(--c-raised)',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Radio-style indicator */}
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    border: `2px solid ${enabled ? '#34d399' : 'var(--c-border-m)'}`,
                    background: enabled ? '#34d399' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {enabled && (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#000' }} />
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

        {/* ── Automations (v2.26 framework) ── */}
        <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)', background: 'var(--c-surface-1)' }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: 'var(--c-gold-l)', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⚙️ Rule Automations
          </div>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, marginBottom: 12 }}>
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

        {/* ── Danger Zone ── */}
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
                🗑 Delete Campaign
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
                  {deleting ? 'Deleting…' : '🗑 Permanently Delete'}
                </button>
              </div>
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
