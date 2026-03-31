import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface DiscordIntegration {
  id: string;
  guild_id: string;
  guild_name: string;
  channel_id: string;
  webhook_url: string;
  active: boolean;
}

interface DiscordSettingsProps {
  campaignId: string;
}

const BOT_FUNCTION_URL = `https://ufowdrspkprlpdnjjkaj.supabase.co/functions/v1/discord-bot`;

export default function DiscordSettings({ campaignId }: DiscordSettingsProps) {
  const [integration, setIntegration] = useState<DiscordIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [guildId, setGuildId] = useState('');
  const [guildName, setGuildName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { load(); }, [campaignId]);

  async function load() {
    const { data } = await supabase.from('discord_integrations').select('*').eq('campaign_id', campaignId).single();
    setIntegration(data as DiscordIntegration | null);
    setLoading(false);
  }

  async function save() {
    if (!guildId.trim() || !guildName.trim()) return;
    setSaving(true);
    if (integration) {
      await supabase.from('discord_integrations').update({ guild_id: guildId, guild_name: guildName, webhook_url: webhookUrl }).eq('id', integration.id);
    } else {
      await supabase.from('discord_integrations').insert({ campaign_id: campaignId, guild_id: guildId, guild_name: guildName, webhook_url: webhookUrl });
    }
    await load();
    setSaving(false);
    setShowSetup(false);
  }

  async function disconnect() {
    if (!integration) return;
    await supabase.from('discord_integrations').delete().eq('id', integration.id);
    setIntegration(null);
  }

  function copyEndpoint() {
    navigator.clipboard.writeText(BOT_FUNCTION_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="loading-text" style={{ padding: 'var(--space-4)' }}>Loading Discord settings…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

      {/* Connected state */}
      {integration ? (
        <div style={{ padding: 'var(--space-4)', border: '1px solid rgba(88,101,242,0.4)', borderRadius: 'var(--radius-lg)', background: 'rgba(88,101,242,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 24 }}>🎮</span>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                  Connected to {integration.guild_name}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Server ID: {integration.guild_id}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn-secondary btn-sm" onClick={() => { setGuildId(integration.guild_id); setGuildName(integration.guild_name); setWebhookUrl(integration.webhook_url); setShowSetup(true); }}>
                Edit
              </button>
              <button className="btn-ghost btn-sm" style={{ color: 'var(--color-crimson-bright)' }} onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </div>

          {/* Bot commands reference */}
          <div style={{ borderTop: '1px solid rgba(88,101,242,0.2)', paddingTop: 'var(--space-3)' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              Bot Commands
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {[
                { cmd: '/schedule poll', desc: 'Start an availability poll for the next session' },
                { cmd: '/schedule results', desc: 'Show current poll results in Discord' },
                { cmd: '/dndkeep info', desc: 'Show campaign info and link' },
              ].map(({ cmd, desc }) => (
                <div key={cmd} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-arcane-bright)', background: 'rgba(91,63,168,0.15)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                    {cmd}
                  </code>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--space-6)', border: '1px dashed var(--border-dim)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ fontSize: 40, marginBottom: 'var(--space-3)' }}>🎮</div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
            Connect to Discord
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', maxWidth: 380, margin: '0 auto var(--space-4)' }}>
            Link your Discord server to enable session scheduling, bot commands, and automatic session reminders.
          </p>
          <button className="btn-gold" onClick={() => setShowSetup(true)}>
            Connect Discord Server
          </button>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
          🔧 Discord Bot Setup (one-time)
        </div>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
          {[
            <>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">discord.com/developers/applications</a> → New Application</>,
            <>Name it "DNDKeep" → navigate to <strong>Bot</strong> → copy the <strong>Public Key</strong></>,
            <>Go to your <a href="https://supabase.com/dashboard/project/ufowdrspkprlpdnjjkaj/functions" target="_blank" rel="noopener noreferrer">Supabase Edge Functions</a> → discord-bot → Add secret: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-arcane-bright)', background: 'rgba(91,63,168,0.15)', padding: '1px 6px', borderRadius: 3 }}>DISCORD_PUBLIC_KEY</code> = your Public Key</>,
            <>Back in Discord Developer Portal → <strong>General Information</strong> → set <strong>Interactions Endpoint URL</strong> to:</>,
            <>Navigate to <strong>OAuth2</strong> → add scopes: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-arcane-bright)', background: 'rgba(91,63,168,0.15)', padding: '1px 6px', borderRadius: 3 }}>bot</code> + <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-arcane-bright)', background: 'rgba(91,63,168,0.15)', padding: '1px 6px', borderRadius: 3 }}>applications.commands</code> → generate invite URL and add to your server</>,
            <>Register slash commands by running the command registration script (see README)</>,
          ].map((step, i) => (
            <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {step}
            </li>
          ))}
        </ol>

        {/* Endpoint URL copy */}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--bg-sunken)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {BOT_FUNCTION_URL}
          </code>
          <button className="btn-secondary btn-sm" onClick={copyEndpoint} style={{ flexShrink: 0 }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetup && (
        <div className="modal-overlay" onClick={() => setShowSetup(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Connect Discord Server</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <label>Server Name</label>
                <input value={guildName} onChange={e => setGuildName(e.target.value)} placeholder="My D&D Group" autoFocus />
              </div>
              <div>
                <label>Server (Guild) ID</label>
                <input value={guildId} onChange={e => setGuildId(e.target.value)} placeholder="123456789012345678" />
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                  In Discord: right-click your server → Copy Server ID (enable Developer Mode in settings first)
                </div>
              </div>
              <div>
                <label>Webhook URL (optional)</label>
                <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                  For automatic session reminders. Discord channel → Edit → Integrations → Webhooks
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowSetup(false)}>Cancel</button>
              <button className="btn-gold" onClick={save} disabled={saving || !guildId.trim() || !guildName.trim()}>
                {saving ? 'Saving…' : 'Connect Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
