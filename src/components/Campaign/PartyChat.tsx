import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// v2.288.0 — Campaign chat now supports inline GIFs via Giphy. The
// schema needed no migration: GIFs are stored as ordinary
// campaign_chat rows with message_type='gif' and the message column
// holding the GIF's still or animated URL. There's no CHECK on
// message_type so the new value just slots in; existing 'text' rows
// stay untouched.
//
// API KEY SAFETY: Giphy "API keys" are public client-side identifiers
// designed to be embedded in browser apps (same as Stripe publishable
// keys, Supabase anon keys). They are not secrets in the credential
// sense; they're rate-limit anchors per app. Shipping VITE_GIPHY_API_KEY
// in the bundle is normal Giphy usage, not a leak. Driving it through
// an env var anyway so it can be rotated on the Vercel dashboard
// without a code change.

interface ChatMessage {
  id: string;
  user_id: string;
  character_name: string;
  avatar_url: string | null;
  message: string;
  // v2.288.0 — message_type widened from 'text' to 'text' | 'gif'.
  // Other notification types ('announcement', 'save_prompt', etc.)
  // are filtered out by the load + realtime branches below.
  message_type: string;
  created_at: string;
}

interface PartyChatProps {
  campaignId: string;
  characterName?: string;
  avatarUrl?: string | null;
}

// Subset of Giphy's response we care about. The full payload is huge
// (analytics, ratings, multiple image renditions); we only ever read
// the fixed_height variant for in-chat display because it bounds
// vertical layout cost — autoscaled width keeps aspect ratio.
interface GiphyResult {
  id: string;
  title: string;
  images: {
    fixed_height: { url: string; width: string; height: string };
    fixed_height_small: { url: string; width: string; height: string };
  };
}

const GIPHY_API_KEY = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined) ?? '';
const GIPHY_TRENDING = 'https://api.giphy.com/v1/gifs/trending';
const GIPHY_SEARCH = 'https://api.giphy.com/v1/gifs/search';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Render a chat message body. Branches on message_type so future
// types (image upload, dice-roll, etc.) can land here without
// reshuffling layout. Currently:
//   - 'gif'  → <img>, max-height capped so a tall GIF doesn't blow
//     out the message lane; click-to-open in a new tab for full size.
//   - else   → plain text (existing behavior, including unknown types
//     that snuck past the load filter).
function MessageBody({ m }: { m: ChatMessage }) {
  if (m.message_type === 'gif') {
    return (
      <a href={m.message} target="_blank" rel="noopener noreferrer" style={{ display: 'block', lineHeight: 0 }}>
        <img
          src={m.message}
          alt="GIF"
          loading="lazy"
          style={{
            maxWidth: '100%', maxHeight: 220,
            borderRadius: 8,
            background: '#080d14',
          }}
        />
      </a>
    );
  }
  return <>{m.message}</>;
}

export default function PartyChat({ campaignId, characterName, avatarUrl }: PartyChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // v2.288.0 — Giphy picker state. Kept local rather than a separate
  // component because the v2.279 esbuild minifier bug bit us when
  // PartyChat-adjacent code was split into its own component (hook
  // ordering got rearranged). Single self-contained file is the
  // tested-good pattern here.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<GiphyResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  // Debounce ref so each keystroke doesn't fire a Giphy call. 300ms
  // matches the standard debounce feel for instant-search UIs.
  const searchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`party-chat-${campaignId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'campaign_chat',
        filter: `campaign_id=eq.${campaignId}`,
      }, payload => {
        // v2.164.0 — Phase Q.0 pt 5: skip notification message_types.
        // Realtime postgres_changes filter doesn't support compound
        // filters across columns, so we filter client-side.
        // v2.288.0 — also accept 'gif' alongside 'text'.
        const row = payload.new as ChatMessage;
        if (row.message_type !== 'text' && row.message_type !== 'gif') return;
        setMessages(prev => [...prev, row]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadMessages() {
    // v2.164.0 — filter to message_type IN ('text','gif') so notification
    // rows (announcement/save_prompt/etc.) don't render as raw JSON.
    // v2.288.0 — added 'gif' to the IN clause.
    const { data } = await supabase
      .from('campaign_chat')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('message_type', ['text', 'gif'])
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setMessages(data as ChatMessage[]);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function send() {
    if (!input.trim() || !user?.id || sending) return;
    setSending(true);
    const msg = input.trim();
    setInput('');
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: user.id,
      character_name: characterName ?? 'Unknown',
      avatar_url: avatarUrl ?? null,
      message: msg,
      message_type: 'text',
    });
    setSending(false);
    inputRef.current?.focus();
  }

  // v2.288.0 — Giphy fetch. Trending feed when the search box is
  // empty, /search when there's a query. Always pulls 24 results;
  // the picker grid renders 4 cols × 6 rows. Errors are surfaced as
  // an inline message in the picker (rate limit, missing key, network
  // outage) — not toasted, since the picker is itself a transient
  // surface.
  async function fetchGifs(query: string) {
    if (!GIPHY_API_KEY) {
      setGifError('GIF picker is not configured. Set VITE_GIPHY_API_KEY in your environment.');
      setGifResults([]);
      return;
    }
    setGifLoading(true);
    setGifError(null);
    try {
      const url = query.trim()
        ? `${GIPHY_SEARCH}?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
        : `${GIPHY_TRENDING}?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`;
      const res = await fetch(url);
      if (!res.ok) {
        // 401/403 = bad key; 429 = rate limit. Surface the status so a
        // confused DM can debug without opening devtools.
        setGifError(`Giphy returned ${res.status}. Check your API key or try again in a moment.`);
        setGifResults([]);
        return;
      }
      const json = await res.json();
      setGifResults((json.data ?? []) as GiphyResult[]);
    } catch {
      setGifError('Network error talking to Giphy. Check your connection.');
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  }

  // Debounce search-box input. On open, immediately load trending
  // (the empty-query branch in fetchGifs).
  useEffect(() => {
    if (!pickerOpen) return;
    if (searchTimerRef.current != null) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      fetchGifs(gifQuery);
    }, gifQuery.trim() === '' ? 0 : 300);
    return () => {
      if (searchTimerRef.current != null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, gifQuery]);

  async function sendGif(g: GiphyResult) {
    if (!user?.id || sending) return;
    // Use fixed_height variant for in-chat display: bounded height
    // means we never blow out the message column on a tall GIF, and
    // Giphy hosts these as compressed gifs that load fast.
    const url = g.images.fixed_height?.url ?? g.images.fixed_height_small?.url;
    if (!url) return;
    setSending(true);
    setPickerOpen(false);
    setGifQuery('');
    setGifResults([]);
    await supabase.from('campaign_chat').insert({
      campaign_id: campaignId,
      user_id: user.id,
      character_name: characterName ?? 'Unknown',
      avatar_url: avatarUrl ?? null,
      message: url,
      message_type: 'gif',
    });
    setSending(false);
    inputRef.current?.focus();
  }

  // Group consecutive messages from same sender
  const grouped = messages.map((m, i) => ({
    ...m,
    isFirst: i === 0 || messages[i - 1].user_id !== m.user_id,
    isMe: m.user_id === user?.id,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400, position: 'relative' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading ? (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
            <span className="loading-text">Loading chat…</span>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
            No messages yet. Say something to your party!
          </div>
        ) : grouped.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: m.isMe ? 'row-reverse' : 'row',
              alignItems: 'flex-end',
              gap: 'var(--sp-2)',
              marginTop: m.isFirst ? 'var(--sp-2)' : 0,
            }}
          >
            {/* Avatar — only on first message in a group */}
            {m.isFirst && !m.isMe ? (
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: '#080d14', border: '1px solid var(--c-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.avatar_url
                  ? <img src={m.avatar_url} alt={m.character_name} width={28} height={28} style={{ objectFit: 'cover' }} />
                  : <span style={{ fontSize: 12 }}></span>}
              </div>
            ) : (
              !m.isMe && <div style={{ width: 28, flexShrink: 0 }} />
            )}

            <div style={{ maxWidth: '72%' }}>
              {/* Sender name on first message */}
              {m.isFirst && !m.isMe && (
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', marginBottom: 2, letterSpacing: '0.06em' }}>
                  {m.character_name}
                </div>
              )}

              {/* Message bubble. v2.288.0 — for GIF messages we drop
                  the bubble background/border so the GIF reads as a
                  framed image rather than a captioned bubble. */}
              <div style={{
                padding: m.message_type === 'gif' ? 0 : 'var(--sp-2) var(--sp-3)',
                borderRadius: m.isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: m.message_type === 'gif' ? 'transparent' : (m.isMe ? 'rgba(201,146,42,0.18)' : 'var(--c-raised)'),
                border: m.message_type === 'gif' ? 'none' : (m.isMe ? '1px solid rgba(201,146,42,0.3)' : '1px solid var(--c-border)'),
                fontSize: 'var(--fs-sm)', color: 'var(--t-1)',
                lineHeight: 1.5, wordBreak: 'break-word',
                overflow: 'hidden',
              }}>
                <MessageBody m={m} />
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-2)', marginTop: 1, textAlign: m.isMe ? 'right' : 'left' }}>
                {formatTime(m.created_at)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* v2.288.0 — Giphy picker popover. Anchored above the input
          row, absolute-positioned within the chat container so it
          doesn't escape the chat tab's bounds. Click outside (the
          backdrop) to dismiss. Search runs debounced; trending loads
          immediately on open. */}
      {pickerOpen && (
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'transparent' }}
          />
          <div style={{
            position: 'absolute', left: 'var(--sp-3)', right: 'var(--sp-3)', bottom: 64,
            zIndex: 11,
            maxHeight: 360,
            background: 'var(--c-card)',
            border: '1px solid var(--c-gold-bdr)',
            borderRadius: 12,
            boxShadow: '0 -8px 28px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid var(--c-border)',
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
                GIF
              </span>
              <input
                autoFocus
                value={gifQuery}
                onChange={e => setGifQuery(e.target.value)}
                placeholder="Search GIFs… (or leave blank for trending)"
                style={{ flex: 1, fontSize: 'var(--fs-sm)' }}
              />
              <button
                className="btn-ghost btn-sm"
                onClick={() => setPickerOpen(false)}
                style={{ flexShrink: 0, fontSize: 11 }}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {gifError ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-2)', fontSize: 12, fontFamily: 'var(--ff-body)' }}>
                  {gifError}
                </div>
              ) : gifLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  <span className="loading-text">Searching Giphy…</span>
                </div>
              ) : gifResults.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-2)', fontSize: 12 }}>
                  No GIFs found.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                }}>
                  {gifResults.map(g => {
                    const thumb = g.images.fixed_height_small?.url ?? g.images.fixed_height?.url;
                    if (!thumb) return null;
                    return (
                      <button
                        key={g.id}
                        onClick={() => sendGif(g)}
                        title={g.title}
                        style={{
                          padding: 0,
                          background: '#080d14',
                          border: '1px solid var(--c-border)',
                          borderRadius: 6,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          aspectRatio: '1 / 1',
                          minHeight: 0,
                        }}
                      >
                        <img
                          src={thumb}
                          alt={g.title}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Giphy ToS requires attribution when their API is used. */}
            <div style={{
              padding: '4px 10px',
              borderTop: '1px solid var(--c-border)',
              fontSize: 9,
              color: 'var(--t-3)',
              fontFamily: 'var(--ff-body)',
              letterSpacing: '0.04em',
              textAlign: 'right',
            }}>
              Powered by GIPHY
            </div>
          </div>
        </>
      )}

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--c-border)', padding: 'var(--sp-3)', display: 'flex', gap: 'var(--sp-2)' }}>
        <button
          onClick={() => setPickerOpen(v => !v)}
          title="Send a GIF"
          style={{
            flexShrink: 0,
            padding: '6px 10px',
            background: pickerOpen ? 'var(--c-gold-bg)' : 'var(--c-raised)',
            border: pickerOpen ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
            borderRadius: 6,
            color: pickerOpen ? 'var(--c-gold-l)' : 'var(--t-2)',
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            minHeight: 0,
          }}
        >
          GIF
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Message as ${characterName ?? 'Unknown'}…`}
          style={{ flex: 1, fontSize: 'var(--fs-sm)' }}
          disabled={sending}
        />
        <button
          className="btn-gold btn-sm"
          onClick={send}
          disabled={!input.trim() || sending}
          style={{ flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
