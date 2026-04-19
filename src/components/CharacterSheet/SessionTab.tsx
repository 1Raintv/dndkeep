import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character } from '../../types';
import { supabase } from '../../lib/supabase';
import InitiativeTracker from '../shared/InitiativeTracker';
import PartyHPPanel from '../shared/PartyHPPanel';
import SessionChat from '../shared/SessionChat';

interface SessionTabProps {
 character: Character;
 isPro: boolean;
 userId: string;
 isDM?: boolean;
}

interface CampaignSummary {
 id: string;
 name: string;
 owner_id: string;
 is_active: boolean;
 join_code: string;
}

export default function SessionTab({ character, isPro, userId, isDM=false }: SessionTabProps) {
 const navigate = useNavigate();
 const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
 const [loading, setLoading] = useState(true);
 const [creating, setCreating] = useState(false);
 const [newName, setNewName] = useState('');
 const [newDesc, setNewDesc] = useState('');
 const [showCreate, setShowCreate] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [sessionTab, setSessionTab] = useState<'campaign'|'initiative'|'party'|'chat'>('campaign');
 const [rollFeed, setRollFeed] = useState<{id:string;char:string;label:string;total:number;dice:string;ts:number}[]>([]);
 const feedRef = useRef<HTMLDivElement>(null);

 // Subscribe to campaign roll feed for first active campaign
 useEffect(() => {
 if (!isPro || campaigns.length === 0) return;
 const activeCampaign = campaigns.find(c => c.is_active) ?? campaigns[0];
 if (!activeCampaign) return;
 // Load recent rolls
 supabase.from('roll_logs')
 .select('id, character_id, label, total, individual_results, created_at, character_name')
 .eq('campaign_id', activeCampaign.id)
 .order('created_at', { ascending: false })
 .limit(20)
 .then(({ data }) => {
 if (!data) return;
 const feed = data.reverse().map(r => ({
 id: r.id,
 char: r.character_name ?? 'Unknown',
 label: r.label ?? 'Roll',
 total: r.total,
 dice: Array.isArray(r.individual_results) ? r.individual_results.join(', ') : '',
 ts: new Date(r.created_at).getTime(),
 }));
 setRollFeed(feed);
 });
 // Real-time subscription
 const ch = supabase.channel(`roll-feed-${activeCampaign.id}`)
 .on('postgres_changes', {
 event: 'INSERT', schema: 'public', table: 'roll_logs',
 filter: `campaign_id=eq.${activeCampaign.id}`,
 }, async payload => {
 const r = payload.new as any;
 // Fetch character name
 const { data: char } = await supabase.from('characters').select('name').eq('id', r.character_id).single();
 setRollFeed(f => [...f.slice(-29), {
 id: r.id, char: char?.name ?? 'Unknown',
 label: r.label ?? 'Roll', total: r.total,
 dice: Array.isArray(r.individual_results) ? r.individual_results.join(', ') : '',
 ts: new Date(r.created_at).getTime(),
 }]);
 })
 .subscribe();
 return () => { supabase.removeChannel(ch); };
 }, [isPro, campaigns]);

 // Auto-scroll feed
 useEffect(() => {
 if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
 }, [rollFeed]);

 useEffect(() => {
 if (!isPro) { setLoading(false); return; }
 loadCampaigns();
 }, [isPro, userId]);

 async function loadCampaigns() {
 setLoading(true);
 // Get all campaigns the user is a member of (DM or player via RLS)
 const { data } = await supabase
 .from('campaigns')
 .select('id, name, owner_id, is_active, join_code')
 .order('updated_at', { ascending: false });
 setCampaigns(data ?? []);
 setLoading(false);
 }

 async function createSession() {
 if (!newName.trim()) return;
 setCreating(true);
 setError(null);
 try {
 const { data: camp, error: campErr } = await supabase
 .from('campaigns')
 .insert({
 owner_id: userId,
 name: newName.trim(),
 description: newDesc.trim(),
 is_active: true,
 })
 .select()
 .single();
 if (campErr || !camp) throw new Error(campErr?.message ?? 'Failed to create session');

 // Auto-join as DM
 await supabase.from('campaign_members').insert({
 campaign_id: camp.id,
 user_id: userId,
 role: 'dm',
 });

 navigate(`/campaigns/${camp.id}`);
 } catch (e: any) {
 setError(e.message);
 setCreating(false);
 }
 }

 // ── Free tier gate ──────────────────────────────────────────────────────
 if (!isPro) {
 return (
 <div style={{ maxWidth: 520 }}>
 <div style={{
 padding: 'var(--sp-6)',
 borderRadius: 'var(--r-lg)',
 border: '1px solid var(--c-gold-bdr)',
 background: 'rgba(201,146,42,0.06)',
 textAlign: 'center',
 }}>
 
 <h3 style={{ marginBottom: 'var(--sp-2)', fontFamily: 'var(--ff-body)', color: 'var(--c-gold-l)' }}>
 DM Sessions — Pro Feature
 </h3>
 <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, marginBottom: 'var(--sp-5)' }}>
 Create live campaign sessions, share a join code with your players, track initiative in real-time, and manage HP across the whole party. Upgrade to Pro to unlock DM tools.
 </p>
 <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 'var(--sp-4)' }}>
 {['Real-time party sync', 'Initiative tracker', 'Condition management', 'Unlimited campaigns'].map(f => (
 <span key={f} style={{
 fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700,
 padding: '4px 10px', borderRadius: 'var(--r-sm)',
 border: '1px solid rgba(201,146,42,0.3)', color: 'var(--c-gold-l)',
 background: 'rgba(201,146,42,0.08)',
 }}> {f}</span>
 ))}
 </div>
 <button
 className="btn-gold"
 onClick={() => navigate('/settings')}
 style={{ justifyContent: 'center', width: '100%', maxWidth: 240 }}
 >
 Upgrade to Pro
 </button>
 </div>
 </div>
 );
 }

 // ── Pro: loading ────────────────────────────────────────────────────────
 if (loading) {
 return (
 <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-6)' }}>
 <div className="spinner" />
 <span className="loading-text">Loading sessions...</span>
 </div>
 );
 }

 // ── Pro: main view ──────────────────────────────────────────────────────
 return (
 <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

 {/* Active sessions */}
 {campaigns.length > 0 && (
 <div>
 <div className="section-header">Your DM Sessions</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
 {campaigns.map(camp => (
 <div key={camp.id} style={{
 display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
 padding: 'var(--sp-3) var(--sp-4)',
 borderRadius: 'var(--r-md)',
 border: `1px solid ${camp.is_active ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
 background: camp.is_active ? 'rgba(201,146,42,0.06)' : 'var(--c-surface)',
 }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
 {camp.name}
 </span>
 {camp.is_active && (
 <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hp-full)', flexShrink: 0 }} />
 )}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
 Join code: <span style={{ color: 'var(--c-gold-l)', letterSpacing: '0.1em' }}>{camp.join_code}</span>
 </div>
 </div>
 <button
 className="btn-gold btn-sm"
 onClick={() => navigate(`/campaigns/${camp.id}`)}
 >
 Enter Session
 </button>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Create new session */}
 {!showCreate ? (
 <div>
 {campaigns.length === 0 && (
 <div style={{ textAlign: 'center', padding: 'var(--sp-6)', marginBottom: 'var(--sp-4)' }}>
 
 <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
 No sessions yet. Create one and share the join code with your players.
 </p>
 </div>
 )}
 <button
 className="btn-primary"
 onClick={() => setShowCreate(true)}
 style={{ width: '100%', justifyContent: 'center' }}
 >
 + Create DM Session
 </button>
 </div>
 ) : (
 <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
 <div className="section-header" style={{ marginBottom: 0 }}>New Session</div>

 <div>
 <label style={{ fontSize: 'var(--fs-xs)' }}>Session Name *</label>
 <input
 value={newName}
 onChange={e => setNewName(e.target.value)}
 placeholder="The Lost Mines of Phandelver..."
 onKeyDown={e => e.key === 'Enter' && createSession()}
 autoFocus
 />
 </div>

 <div>
 <label style={{ fontSize: 'var(--fs-xs)' }}>Description (optional)</label>
 <input
 value={newDesc}
 onChange={e => setNewDesc(e.target.value)}
 placeholder="Campaign notes, setting..."
 />
 </div>

 {error && (
 <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)', fontFamily: 'var(--ff-body)' }}>
 {error}
 </p>
 )}

 <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
 <button className="btn-secondary" onClick={() => { setShowCreate(false); setError(null); }}>
 Cancel
 </button>
 <button
 className="btn-primary"
 onClick={createSession}
 disabled={creating || !newName.trim()}
 style={{ flex: 1, justifyContent: 'center' }}
 >
 {creating ? 'Creating...' : 'Create & Enter Session'}
 </button>
 </div>
 </div>
 )}

 {/* Session sub-tabs when in a campaign */}
 {isPro && campaigns.length > 0 && (() => {
 const camp = campaigns.find(c=>c.is_active) ?? campaigns[0];
 return (
 <>
 <div style={{ display:'flex', gap:4, padding:'0 0 4px' }}>
 {(['campaign','initiative','party','chat'] as const).map(t=>(
 <button key={t} onClick={()=>setSessionTab(t)}
 style={{ flex:1, padding:'5px 4px', borderRadius:6, border:`1px solid ${sessionTab===t?'var(--c-gold)':'var(--c-border)'}`, background:sessionTab===t?'rgba(245,158,11,0.10)':'transparent', color:sessionTab===t?'var(--c-gold-l)':'var(--t-3)', cursor:'pointer', fontFamily:'var(--ff-body)', fontWeight:700, fontSize:9, textTransform:'uppercase', letterSpacing:'.08em' }}>
 {t==='initiative'?'':t==='party'?'':t==='chat'?'':''} {t}
 </button>
 ))}
 </div>
 {sessionTab==='initiative' && <InitiativeTracker campaignId={camp.id} isDM={isDM} characterName={character.name} characterId={character.id} />}
 {sessionTab==='party' && <PartyHPPanel campaignId={camp.id} isDM={isDM} userId={userId} myCharacterId={character.id} />}
 {sessionTab==='chat' && <div style={{height:300}}><SessionChat campaignId={camp.id} characterName={character.name} characterId={character.id} userId={userId} avatarUrl={character.avatar_url??undefined} /></div>}
 </>
 );
 })()}
 {/* Campaign Roll Feed */}
 {isPro && rollFeed.length > 0 && (
 <div style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
 <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
 Live Roll Feed
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>party-wide · real-time</span>
 </div>
 <div ref={feedRef} style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
 {rollFeed.map((r, i) => {
 const isMe = r.char === character.name;
 const dieColors: Record<string,string> = {4:'#a78bfa',6:'#f87171',8:'#4ade80',10:'#60a5fa',12:'#f472b6',20:'#fbbf24'};
 return (
 <div key={r.id} style={{
 padding: '6px 12px',
 borderBottom: i < rollFeed.length - 1 ? '1px solid var(--c-border)' : 'none',
 background: isMe ? 'rgba(245,158,11,0.06)' : 'transparent',
 display: 'flex', alignItems: 'center', gap: 8,
 }}>
 <div style={{ width: 6, height: 6, borderRadius: '50%', background: isMe ? 'var(--c-gold)' : 'var(--c-border)', flexShrink: 0 }} />
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, color: isMe ? 'var(--c-gold-l)' : 'var(--t-2)', minWidth: 70, flexShrink: 0 }}>
 {r.char}
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 {r.label}
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 16, color: 'var(--t-1)', lineHeight: 1 }}>
 {r.total}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Join a session (as player) */}
 <div style={{
 padding: 'var(--sp-3) var(--sp-4)',
 borderRadius: 'var(--r-md)',
 border: '1px solid var(--c-border)',
 background: '#080d14',
 fontFamily: 'var(--ff-body)',
 fontSize: 'var(--fs-xs)',
 color: 'var(--t-2)',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'space-between',
 gap: 'var(--sp-3)',
 }}>
 <span>Looking for a session to join as a player?</span>
 <button className="btn-ghost btn-sm" onClick={() => navigate('/campaigns')} style={{ fontSize: 'var(--fs-xs)' }}>
 View All Campaigns →
 </button>
 </div>
 </div>
 );
}
