import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface NPC {
  id: string;
  name: string;
  role: string;
  race: string;
  location: string;
  faction: string;
  relationship: string;
  status: string;
  description: string;
  notes: string;
  last_seen: string;
  is_alive: boolean;
}

interface NPCManagerProps {
  campaignId: string;
  isOwner: boolean;
}

const ROLES = ['ally', 'enemy', 'neutral', 'merchant', 'quest-giver', 'boss', 'unknown'];
const RELATIONSHIPS = ['friendly', 'neutral', 'hostile', 'unknown', 'feared', 'trusted'];

const ROLE_COLORS: Record<string, string> = {
  ally: '#34d399', enemy: '#f87171', neutral: '#94a3b8',
  merchant: '#fbbf24', 'quest-giver': '#a78bfa', boss: '#ef4444', unknown: '#64748b',
};

const ROLE_ICONS: Record<string, string> = {
  ally: '', enemy: '', neutral: '', merchant: '',
  'quest-giver': '', boss: '', unknown: '',
};

const empty = (): Partial<NPC> => ({
  name: '', role: 'neutral', race: '', location: '', faction: '',
  relationship: 'neutral', status: 'alive', description: '', notes: '',
  last_seen: '', is_alive: true,
});

export default function NPCManager({ campaignId, isOwner }: NPCManagerProps) {
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showDead, setShowDead] = useState(false);
  const [editing, setEditing] = useState<Partial<NPC> | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { load(); }, [campaignId]);

  async function load() {
    const { data } = await supabase.from('npcs').select('*')
      .eq('campaign_id', campaignId).order('name');
    setNpcs((data ?? []) as NPC[]);
    setLoading(false);
  }

  async function save() {
    if (!editing?.name?.trim()) return;
    setSaving(true);
    if ((editing as NPC).id) {
      await supabase.from('npcs').update({ ...editing, updated_at: new Date().toISOString() }).eq('id', (editing as NPC).id);
    } else {
      await supabase.from('npcs').insert({ ...editing, campaign_id: campaignId });
    }
    await load();
    setEditing(null);
    setSaving(false);
  }

  async function toggleAlive(npc: NPC) {
    await supabase.from('npcs').update({ is_alive: !npc.is_alive, status: npc.is_alive ? 'dead' : 'alive' }).eq('id', npc.id);
    setNpcs(prev => prev.map(n => n.id === npc.id ? { ...n, is_alive: !n.is_alive, status: n.is_alive ? 'dead' : 'alive' } : n));
  }

  async function deleteNPC(id: string) {
    await supabase.from('npcs').delete().eq('id', id);
    setNpcs(prev => prev.filter(n => n.id !== id));
  }

  const filtered = npcs.filter(n => {
    if (!showDead && !n.is_alive) return false;
    if (filterRole && n.role !== filterRole) return false;
    if (search && !n.name.toLowerCase().includes(search.toLowerCase()) && !n.location.toLowerCase().includes(search.toLowerCase()) && !n.faction.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = ROLES.reduce<Record<string, NPC[]>>((acc, role) => {
    const group = filtered.filter(n => n.role === role);
    if (group.length) acc[role] = group;
    return acc;
  }, {});

  if (loading) return <div className="loading-text" style={{ padding: 'var(--sp-4)' }}>Loading NPCs…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, location, faction…"
          style={{ flex: 1, minWidth: 160, fontSize: 'var(--fs-sm)' }}
        />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ fontSize: 'var(--fs-sm)', width: 'auto' }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', textTransform: 'none', letterSpacing: 0, marginBottom: 0 }}>
          <input type="checkbox" checked={showDead} onChange={e => setShowDead(e.target.checked)} />
          Show deceased
        </label>
        {isOwner && (
          <button className="btn-gold btn-sm" onClick={() => setEditing(empty())}>+ New NPC</button>
        )}
      </div>

      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
        {filtered.length} NPC{filtered.length !== 1 ? 's' : ''} · {npcs.filter(n => !n.is_alive).length} deceased
      </div>

      {/* Grouped NPC list */}
      {Object.entries(grouped).map(([role, group]) => (
        <div key={role}>
          <div className="section-header">
            {ROLE_ICONS[role]} {role.charAt(0).toUpperCase() + role.slice(1)}s
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {group.map(npc => {
              const roleColor = ROLE_COLORS[npc.role] ?? '#94a3b8';
              const isExpanded = expanded === npc.id;
              return (
                <div key={npc.id} style={{
                  border: `1px solid ${npc.is_alive ? roleColor + '30' : 'var(--c-border)'}`,
                  borderRadius: 'var(--r-lg)',
                  background: '#080d14',
                  opacity: npc.is_alive ? 1 : 0.55,
                  overflow: 'hidden',
                  transition: 'all var(--tr-fast)',
                }}>
                  {/* NPC row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', cursor: 'pointer' }}
                    onClick={() => setExpanded(isExpanded ? null : npc.id)}>
                    {/* Role dot */}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: roleColor, flexShrink: 0, boxShadow: `0 0 6px ${roleColor}` }} />
                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: npc.is_alive ? 'var(--t-1)' : 'var(--t-2)' }}>
                          {npc.name}
                          {!npc.is_alive && ' '}
                        </span>
                        {npc.race && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{npc.race}</span>}
                        {npc.faction && (
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 600, color: 'var(--c-purple-l)', background: 'rgba(91,63,168,0.12)', padding: '1px 6px', borderRadius: 999, border: '1px solid rgba(91,63,168,0.25)' }}>
                            {npc.faction}
                          </span>
                        )}
                      </div>
                      {npc.location && (
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 1 }}>
                          {npc.location}{npc.last_seen ? ` · Last seen: ${npc.last_seen}` : ''}
                        </div>
                      )}
                    </div>
                    {/* Relationship badge */}
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: roleColor, background: `${roleColor}15`, border: `1px solid ${roleColor}40`, padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>
                      {npc.relationship}
                    </span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="animate-fade-in" style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                      {npc.description && (
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, margin: 0 }}>{npc.description}</p>
                      )}
                      {npc.notes && (
                        <div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 4 }}>DM Notes</div>
                          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{npc.notes}</p>
                        </div>
                      )}
                      {isOwner && (
                        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                          <button className="btn-secondary btn-sm" onClick={() => setEditing(npc)}>Edit</button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => toggleAlive(npc)}
                            style={{ color: npc.is_alive ? 'var(--c-red-l)' : 'var(--hp-full)' }}
                          >
                            {npc.is_alive ? 'Mark Dead' : 'Revive'}
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => deleteNPC(npc.id)} style={{ color: 'var(--c-red-l)', marginLeft: 'auto' }}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
          {npcs.length === 0
            ? `No NPCs yet.${isOwner ? ' Add your first NPC to track allies, enemies, and notable characters.' : ''}`
            : 'No NPCs match your filter.'}
        </div>
      )}

      {/* NPC Form Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          {/* v2.169.0 — same fix as Campaign Settings v2.168. The
              .modal class has overflow:hidden with no inner padding,
              which clipped the NPC form's h3 and Save button against
              the edges. Bumped 520→720 and added inline padding. */}
          <div className="modal" style={{ maxWidth: 720, width: '92vw', padding: '20px 24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>{(editing as NPC).id ? 'Edit' : 'New'} NPC</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div><label>Name *</label><input value={editing.name ?? ''} onChange={e => setEditing(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
                <div><label>Role</label>
                  <select value={editing.role ?? 'neutral'} onChange={e => setEditing(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div><label>Relationship</label>
                  <select value={editing.relationship ?? 'neutral'} onChange={e => setEditing(f => ({ ...f, relationship: e.target.value }))}>
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div><label>Race / Type</label><input value={editing.race ?? ''} onChange={e => setEditing(f => ({ ...f, race: e.target.value }))} placeholder="Human, Elf, Dragon…" /></div>
                <div><label>Faction</label><input value={editing.faction ?? ''} onChange={e => setEditing(f => ({ ...f, faction: e.target.value }))} placeholder="Thieves Guild, Crown…" /></div>
                <div><label>Current Location</label><input value={editing.location ?? ''} onChange={e => setEditing(f => ({ ...f, location: e.target.value }))} placeholder="The Rusty Flagon…" /></div>
                <div><label>Last Seen</label><input value={editing.last_seen ?? ''} onChange={e => setEditing(f => ({ ...f, last_seen: e.target.value }))} placeholder="Session 3, Market…" /></div>
              </div>
              <div><label>Description</label><textarea value={editing.description ?? ''} onChange={e => setEditing(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What the party knows about this character…" /></div>
              <div><label>DM Notes (private)</label><textarea value={editing.notes ?? ''} onChange={e => setEditing(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Secrets, motivations, planned scenes…" /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-gold" onClick={save} disabled={saving || !editing.name?.trim()}>{saving ? 'Saving…' : 'Save NPC'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
