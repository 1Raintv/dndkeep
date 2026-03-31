import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ActionLogEntry {
  id: string;
  actor_name: string;
  action_type: string;
  action_description: string;
  value?: number;
  created_at: string;
}

interface SessionSummary {
  id: string;
  title: string;
  summary: string;
  highlights: string[];
  session_date: string;
  generated_at: string;
}

interface AISummaryProps {
  campaignId: string;
  campaignName: string;
  isOwner: boolean;
}

export default function AISummary({ campaignId, campaignName, isOwner }: AISummaryProps) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadSummaries(); }, [campaignId]);

  async function loadSummaries() {
    const { data } = await supabase.from('session_summaries').select('*')
      .eq('campaign_id', campaignId).order('session_date', { ascending: false }).limit(10);
    setSummaries((data ?? []) as SessionSummary[]);
    setLoading(false);
  }

  async function generateSummary() {
    setGenerating(true);
    setError('');

    try {
      // Fetch last session's action log (last 4 hours of activity, or last 100 actions)
      const since = new Date();
      since.setHours(since.getHours() - 8);
      const { data: logs } = await supabase.from('action_logs')
        .select('*').eq('campaign_id', campaignId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(150);

      if (!logs?.length) {
        setError('No session activity found in the last 8 hours. Play a session first, then generate a summary.');
        setGenerating(false);
        return;
      }

      // Build action log text for the prompt
      const logText = (logs as ActionLogEntry[]).map(l =>
        `[${new Date(l.created_at).toLocaleTimeString()}] ${l.actor_name}: ${l.action_description}${l.value ? ` (${l.value})` : ''}`
      ).join('\n');

      const playerNames = [...new Set((logs as ActionLogEntry[]).map(l => l.actor_name))].join(', ');

      // Call Claude API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a skilled D&D session chronicler. Given a session action log, write an engaging narrative recap in 2-3 paragraphs. Write in past tense, third person, epic fantasy style. Focus on the most dramatic moments, heroic actions, and story beats. After the narrative, list 3-5 key highlights as short bullet points. 

Return ONLY valid JSON in this exact format:
{
  "title": "Session title (5 words max, dramatic)",
  "summary": "The 2-3 paragraph narrative recap",
  "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"]
}`,
          messages: [{
            role: 'user',
            content: `Campaign: ${campaignName}\nPlayers: ${playerNames}\n\nSession Action Log:\n${logText}\n\nWrite the session recap.`
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text ?? '';

      // Parse the JSON response
      let parsed: { title: string; summary: string; highlights: string[] };
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch {
        // Fallback if JSON parsing fails
        parsed = {
          title: 'Session Recap',
          summary: text,
          highlights: [],
        };
      }

      // Save to DB
      const { data: saved } = await supabase.from('session_summaries').insert({
        campaign_id: campaignId,
        title: parsed.title,
        summary: parsed.summary,
        highlights: parsed.highlights,
        session_date: new Date().toISOString().split('T')[0],
      }).select().single();

      if (saved) {
        setSummaries(prev => [saved as SessionSummary, ...prev]);
        setExpanded((saved as SessionSummary).id);
      }
    } catch (err) {
      setError('Failed to generate summary. Please try again.');
      console.error(err);
    }

    setGenerating(false);
  }

  async function deleteSummary(id: string) {
    await supabase.from('session_summaries').delete().eq('id', id);
    setSummaries(prev => prev.filter(s => s.id !== id));
  }

  if (loading) return <div className="loading-text" style={{ padding: 'var(--space-4)' }}>Loading summaries…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Generate button */}
      {isOwner && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
              After each session, generate an AI-written narrative recap from your action log. Great for sharing with players and remembering what happened.
            </p>
          </div>
          <button
            className="btn-arcane"
            onClick={generateSummary}
            disabled={generating}
            style={{
              background: 'linear-gradient(135deg, #2d1f5e 0%, #5b3fa8 100%)',
              color: '#e8e0ff',
              border: '1px solid rgba(91,63,168,0.5)',
              borderRadius: 'var(--radius-lg)',
              flexShrink: 0,
            }}
          >
            {generating ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14, borderTopColor: '#a78bfa' }} />
                Writing recap…
              </>
            ) : '✨ Generate Session Recap'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.3)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: '#ff8a80' }}>
          {error}
        </div>
      )}

      {/* Summaries list */}
      {summaries.map(summary => {
        const isOpen = expanded === summary.id;
        return (
          <div key={summary.id} style={{
            border: '1px solid rgba(91,63,168,0.25)',
            borderRadius: 'var(--radius-xl)',
            background: isOpen ? 'rgba(91,63,168,0.04)' : 'var(--bg-sunken)',
            overflow: 'hidden',
            transition: 'background var(--transition-fast)',
          }}>
            {/* Header */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', cursor: 'pointer' }}
              onClick={() => setExpanded(isOpen ? null : summary.id)}
            >
              <span style={{ fontSize: 20 }}>📜</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: isOpen ? 'var(--color-arcane-bright)' : 'var(--text-primary)' }}>
                  {summary.title}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(summary.session_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition-fast)' }}>
                ⌄
              </span>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div className="animate-fade-in" style={{ padding: 'var(--space-2) var(--space-5) var(--space-5)' }}>
                <div style={{ borderTop: '1px solid rgba(91,63,168,0.2)', paddingTop: 'var(--space-4)' }}>
                  {/* Narrative */}
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 'var(--space-4)' }}>
                    {summary.summary}
                  </div>

                  {/* Highlights */}
                  {summary.highlights?.length > 0 && (
                    <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(91,63,168,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(91,63,168,0.2)', marginBottom: 'var(--space-4)' }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-arcane-bright)', marginBottom: 'var(--space-2)' }}>
                        Session Highlights
                      </div>
                      {summary.highlights.map((h, i) => (
                        <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                          <span style={{ color: 'var(--color-gold-bright)', flexShrink: 0 }}>★</span>
                          {h}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const text = `**${summary.title}**\n\n${summary.summary}\n\n**Highlights:**\n${summary.highlights.map(h => `• ${h}`).join('\n')}`;
                        navigator.clipboard.writeText(text);
                      }}
                    >
                      📋 Copy for Discord
                    </button>
                    {isOwner && (
                      <button className="btn-ghost btn-sm" style={{ color: 'var(--color-crimson-bright)' }} onClick={() => deleteSummary(summary.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {summaries.length === 0 && !generating && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          No session recaps yet.{isOwner ? ' Play a session, then click Generate to create your first recap.' : ' Your DM will generate session recaps here.'}
        </div>
      )}
    </div>
  );
}
