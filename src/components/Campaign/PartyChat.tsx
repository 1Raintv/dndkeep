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
        setMessages(prev => [...prev, payload.new as ChatMessage]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadMessages() {
    const { data } = await supabase
      .from('campaign_chat')
      .select('*')
      .eq('campaign_id', campaignId)
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
            <span className="loading-text">Loading chat…</span>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
            No messages yet. Say something to your party!
          </div>
        ) : grouped.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: m.isMe ? 'row-reverse' : 'row',
              alignItems: 'flex-end',
              gap: 'var(--space-2)',
              marginTop: m.isFirst ? 'var(--space-2)' : 0,
            }}
          >
            {/* Avatar — only on first message in a group */}
            {m.isFirst && !m.isMe ? (
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.avatar_url
                  ? <img src={m.avatar_url} alt={m.character_name} width={28} height={28} style={{ objectFit: 'cover' }} />
                  : <span style={{ fontSize: 12 }}>🧙</span>}
              </div>
            ) : (
              !m.isMe && <div style={{ width: 28, flexShrink: 0 }} />
            )}

            <div style={{ maxWidth: '72%' }}>
              {/* Sender name on first message */}
              {m.isFirst && !m.isMe && (
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, fontWeight: 700, color: 'var(--text-gold)', marginBottom: 2, letterSpacing: '0.06em' }}>
                  {m.character_name}
                </div>
              )}

              {/* Message bubble */}
              <div style={{
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: m.isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: m.isMe ? 'rgba(201,146,42,0.18)' : 'var(--bg-raised)',
                border: m.isMe ? '1px solid rgba(201,146,42,0.3)' : '1px solid var(--border-subtle)',
                fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                {m.message}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 8, color: 'var(--text-muted)', marginTop: 1, textAlign: m.isMe ? 'right' : 'left' }}>
                {formatTime(m.created_at)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Message as ${characterName ?? 'Unknown'}…`}
          style={{ flex: 1, fontSize: 'var(--text-sm)' }}
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
