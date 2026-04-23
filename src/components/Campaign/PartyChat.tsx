import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface ChatMessage {
  id: string;
  user_id: string;
  character_name: string;
  avatar_url: string | null;
  message: string;
  message_type: string;
  created_at: string;
}

interface PartyChatProps {
  campaignId: string;
  characterName?: string;
  avatarUrl?: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function PartyChat({ campaignId, characterName, avatarUrl }: PartyChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        const row = payload.new as ChatMessage;
        if (row.message_type !== 'text') return;
        setMessages(prev => [...prev, row]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadMessages() {
    // v2.164.0 — Phase Q.0 pt 5: filter to message_type='text'.
    // The campaign_chat table is also used as a transport for
    // notifications (announcement, save_prompt, check_prompt,
    // player_down, etc.) which are JSON-encoded payloads. Without
    // this filter, those rows render as raw JSON gibberish in the
    // chat bubble, making the whole panel look broken.
    const { data } = await supabase
      .from('campaign_chat')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('message_type', 'text')
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

  // Group consecutive messages from same sender
  const grouped = messages.map((m, i) => ({
    ...m,
    isFirst: i === 0 || messages[i - 1].user_id !== m.user_id,
    isMe: m.user_id === user?.id,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
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

              {/* Message bubble */}
              <div style={{
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: m.isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: m.isMe ? 'rgba(201,146,42,0.18)' : 'var(--c-raised)',
                border: m.isMe ? '1px solid rgba(201,146,42,0.3)' : '1px solid var(--c-border)',
                fontSize: 'var(--fs-sm)', color: 'var(--t-1)',
                lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                {m.message}
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-2)', marginTop: 1, textAlign: m.isMe ? 'right' : 'left' }}>
                {formatTime(m.created_at)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--c-border)', padding: 'var(--sp-3)', display: 'flex', gap: 'var(--sp-2)' }}>
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
