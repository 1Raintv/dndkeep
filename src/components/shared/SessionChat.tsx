import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface ChatMsg { id: string; character_name: string; message: string; created_at: string; message_type?: string; roll_total?: number; roll_label?: string; avatar_url?: string; user_id: string; }

interface Props { campaignId: string; characterName: string; characterId: string; userId: string; avatarUrl?: string; }

export default function SessionChat({ campaignId, characterName, userId, avatarUrl }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('campaign_chat').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true }).limit(50)
      .then(({ data }) => setMsgs(data ?? []));

    const ch = supabase.channel(`chat-${campaignId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_chat', filter: `campaign_id=eq.${campaignId}` },
        ({ new: m }) => setMsgs(prev => [...prev, m as ChatMsg])
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    await supabase.from('campaign_chat').insert({ campaign_id: campaignId, user_id: userId, character_name: characterName, avatar_url: avatarUrl, message: text, message_type: 'text' });
    setSending(false);
  }

  function fmt(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--ff-body)' }}>
      <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--t-3)', padding: '8px 0 6px', flexShrink: 0 }}>Party Chat</div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, paddingRight: 2 }}>
        {msgs.length === 0 && (
          <div style={{ color: 'var(--t-3)', fontSize: 11, textAlign: 'center', padding: 16 }}>No messages yet. Say hello to your party!</div>
        )}
        {msgs.map((m, i) => {
          const isMe = m.user_id === userId;
          const showName = i === 0 || msgs[i-1].user_id !== m.user_id;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: 6, alignItems: 'flex-end' }}>
              {!isMe && showName && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--c-surface)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--t-3)', marginBottom: 2 }}>
                  {m.avatar_url ? <img src={m.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.character_name[0]}
                </div>
              )}
              {!isMe && !showName && <div style={{ width: 24, flexShrink: 0 }} />}
              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 1, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                {showName && <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 600, marginBottom: 1 }}>{m.character_name} · {fmt(m.created_at)}</span>}
                <div style={{ background: isMe ? 'rgba(245,158,11,0.15)' : 'var(--c-surface)', border: `1px solid ${isMe ? 'rgba(245,158,11,0.3)' : 'var(--c-border)'}`, borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding: '6px 10px', fontSize: 12, color: 'var(--t-1)', wordBreak: 'break-word' }}>
                  {m.message_type === 'roll' ? (
                    <span><span style={{ color: 'var(--t-3)' }}>{m.roll_label}: </span><strong style={{ color: '#f59e0b' }}>{m.roll_total}</strong></span>
                  ) : m.message}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 6, paddingTop: 8, flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Message party..." disabled={sending}
          style={{ flex: 1, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '6px 10px', color: 'var(--t-1)', fontSize: 12, fontFamily: 'var(--ff-body)', outline: 'none' }} />
        <button onClick={send} disabled={!input.trim() || sending} className="btn-primary btn-sm" style={{ flexShrink: 0, justifyContent: 'center', fontSize: 12, padding: '6px 12px' }}>Send</button>
      </div>
    </div>
  );
}
