import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

type HpMode = 'hidden' | 'exact' | 'states';

interface PartyMember {
 id: string;
 name: string;
 avatar_url?: string;
 current_hp: number;
 max_hp: number;
 temp_hp: number;
 active_conditions: string[];
 concentration_spell?: string;
 class_name: string;
 level: number;
}

interface Props {
 campaignId: string;
 isDM: boolean;
 userId: string;
 myCharacterId?: string;
}

const STATE_LABELS = [
 { min: 0.76, label: 'Healthy', color: '#22c55e', icon: '' },
 { min: 0.51, label: 'Hurt', color: '#f59e0b', icon: '' },
 { min: 0.26, label: 'Beaten', color: '#f97316', icon: '' },
 { min: 0, label: 'Critical',color: '#ef4444', icon: '' },
];

function getState(hp: number, max: number) {
 if (max === 0) return STATE_LABELS[3];
 const pct = hp / max;
 if (hp === 0) return { label: "Death's Door", color: '#dc2626', icon: '' };
 return STATE_LABELS.find(s => pct > s.min) ?? STATE_LABELS[3];
}

export default function PartyHPPanel({ campaignId, isDM, userId, myCharacterId }: Props) {
 const [members, setMembers] = useState<PartyMember[]>([]);
 const [mode, setMode] = useState<HpMode>('hidden');
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 loadData();
 // Realtime on character HP changes
 const ch = supabase.channel(`party-hp-${campaignId}`)
 .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'characters', filter: `campaign_id=eq.${campaignId}` },
 () => loadData()
 )
 .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
 () => loadData()
 ).subscribe();
 return () => { supabase.removeChannel(ch); };
 }, [campaignId]);

 async function loadData() {
 const [{ data: camp }, { data: chars }] = await Promise.all([
 supabase.from('campaigns').select('hp_visibility_mode').eq('id', campaignId).single(),
 supabase.from('characters').select('id,name,avatar_url,current_hp,max_hp,temp_hp,active_conditions,concentration_spell,class_name,level').eq('campaign_id', campaignId),
 ]);
 if (camp) setMode(camp.hp_visibility_mode as HpMode);
 if (chars) setMembers(chars);
 setLoading(false);
 }

 async function setVisibilityMode(m: HpMode) {
 setMode(m);
 await supabase.from('campaigns').update({ hp_visibility_mode: m }).eq('id', campaignId);
 }

 if (loading) return null;

 const visible = isDM || mode !== 'hidden';
 if (!visible && members.length === 0) return null;

 return (
 <div style={{ fontFamily: 'var(--ff-body)', display: 'flex', flexDirection: 'column', gap: 8 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--t-3)' }}>Party Status</span>
 {isDM && (
 <div style={{ display: 'flex', gap: 2 }}>
 {(['hidden','exact','states'] as HpMode[]).map(m => (
 <button key={m} onClick={() => setVisibilityMode(m)}
 style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${mode===m?'var(--c-gold)':'var(--c-border)'}`, background: mode===m?'rgba(245,158,11,0.12)':'transparent', color: mode===m?'var(--c-gold-l)':'var(--t-3)', fontSize: 9, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontWeight: mode===m?700:400, textTransform: 'uppercase', letterSpacing: '.07em' }}>
 {m}
 </button>
 ))}
 </div>
 )}
 </div>

 {(isDM || mode !== 'hidden') ? (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
 {members.map(m => {
 const isMe = m.id === myCharacterId;
 const st = getState(m.current_hp, m.max_hp);
 return (
 <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, border: `1px solid ${isMe ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`, background: isMe ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
 {/* Avatar */}
 <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--c-surface)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--t-3)' }}>
 {m.avatar_url ? <img src={m.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name[0]?.toUpperCase()}
 </div>

 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 {m.name} <span style={{ fontWeight: 400, color: 'var(--t-3)', fontSize: 9 }}>Lv{m.level} {m.class_name}</span>
 </span>
 {(isDM || mode === 'exact') ? (
 <span style={{ fontSize: 11, fontWeight: 700, color: m.current_hp === 0 ? '#ef4444' : 'var(--t-2)', flexShrink: 0, marginLeft: 8 }}>
 {m.current_hp}{m.temp_hp > 0 ? `+${m.temp_hp}` : ''}/{m.max_hp}
 </span>
 ) : mode === 'states' ? (
 <span style={{ fontSize: 11, color: st.color, flexShrink: 0, marginLeft: 8 }}>{st.icon} {st.label}</span>
 ) : null}
 </div>

 {(isDM || mode === 'exact') && (
 <div style={{ height: 3, background: 'var(--c-border)', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
 <div style={{ height: '100%', width: `${m.max_hp > 0 ? (m.current_hp / m.max_hp) * 100 : 0}%`, background: st.color, borderRadius: 2, transition: 'width .3s' }} />
 </div>
 )}

 {/* Conditions & concentration */}
 {(m.active_conditions?.length > 0 || m.concentration_spell) && (
 <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
 {m.concentration_spell && <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(139,92,246,0.15)', borderRadius: 3, padding: '1px 4px' }}> {m.concentration_spell}</span>}
 {m.active_conditions?.slice(0, 3).map(c => (
 <span key={c} style={{ fontSize: 9, color: 'var(--t-3)', background: 'var(--c-surface)', borderRadius: 3, padding: '1px 4px' }}>{c}</span>
 ))}
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div style={{ padding: '8px', textAlign: 'center', color: 'var(--t-3)', fontSize: 11, border: '1px dashed var(--c-border)', borderRadius: 8 }}>
 HP hidden by DM
 </div>
 )}
 </div>
 );
}
