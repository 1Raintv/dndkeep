import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Schedule {
  id: string;
  title: string;
  description: string;
  proposed_dates: string[];
  confirmed_date: string | null;
  deadline: string | null;
  status: string;
  created_at: string;
}

interface AvailabilityResponse {
  id: string;
  player_name: string;
  available_dates: string[];
  responded_at: string;
}

interface SessionSchedulerProps {
  campaignId: string;
  isOwner: boolean;
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function getNextDays(n: number): string[] {
  const days: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (days.length < n) {
    if (d.getDay() !== 0) days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export default function SessionScheduler({ campaignId, isOwner }: SessionSchedulerProps) {
  const { user, profile } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [responses, setResponses] = useState<Record<string, AvailabilityResponse[]>>({});
  const [myResponse, setMyResponse] = useState<Record<string, string[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('Next Session');
  const [newDesc, setNewDesc] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>(getNextDays(7));
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    loadSchedules();
    const channel = supabase.channel(`scheduler-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_availability' }, () => loadSchedules())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadSchedules() {
    const { data: s } = await supabase.from('session_schedules').select('*')
      .eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(5);
    if (!s) { setLoading(false); return; }
    setSchedules(s as Schedule[]);

    // Load responses for each schedule
    const allResponses: Record<string, AvailabilityResponse[]> = {};
    const myAvail: Record<string, string[]> = {};
    for (const sched of s) {
      const { data: r } = await supabase.from('schedule_availability').select('*').eq('schedule_id', sched.id);
      if (r) {
        allResponses[sched.id] = r as AvailabilityResponse[];
        const mine = r.find((x: AvailabilityResponse) => x.player_name === (profile?.display_name ?? 'Player'));
        myAvail[sched.id] = mine?.available_dates ?? [];
      }
    }
    setResponses(allResponses);
    setMyResponse(myAvail);
    setLoading(false);
  }

  async function createSchedule() {
    if (!newTitle.trim() || selectedDays.length < 2) return;
    setSaving(true);
    await supabase.from('session_schedules').insert({
      campaign_id: campaignId,
      created_by: user?.id,
      title: newTitle.trim(),
      description: newDesc.trim(),
      proposed_dates: selectedDays.sort(),
      deadline: deadline ? new Date(deadline + 'T23:59:59').toISOString() : null,
      status: 'polling',
    });
    setShowCreate(false);
    setNewTitle('Next Session');
    setNewDesc('');
    setSaving(false);
    loadSchedules();
  }

  async function toggleAvailability(scheduleId: string, date: string) {
    const playerName = profile?.display_name ?? 'Player';
    const current = myResponse[scheduleId] ?? [];
    const newDates = current.includes(date) ? current.filter(d => d !== date) : [...current, date];
    setMyResponse(prev => ({ ...prev, [scheduleId]: newDates }));

    const { data: existing } = await supabase.from('schedule_availability').select('id').eq('schedule_id', scheduleId).eq('player_name', playerName).single();
    if (existing) {
      await supabase.from('schedule_availability').update({ available_dates: newDates }).eq('id', existing.id);
    } else {
      await supabase.from('schedule_availability').insert({ schedule_id: scheduleId, user_id: user?.id, player_name: playerName, available_dates: newDates });
    }
    loadSchedules();
  }

  async function confirmDate(scheduleId: string, date: string) {
    await supabase.from('session_schedules').update({ confirmed_date: new Date(date + 'T18:00:00').toISOString(), status: 'confirmed' }).eq('id', scheduleId);
    loadSchedules();
  }

  async function cancelSchedule(scheduleId: string) {
    await supabase.from('session_schedules').update({ status: 'cancelled' }).eq('id', scheduleId);
    loadSchedules();
  }

  function getBestDates(schedule: Schedule): string[] {
    const allResponses = responses[schedule.id] ?? [];
    if (!allResponses.length) return [];
    const scored = schedule.proposed_dates.map(d => ({
      date: d,
      count: allResponses.filter(r => r.available_dates.includes(d)).length,
    }));
    const max = Math.max(...scored.map(s => s.count));
    return scored.filter(s => s.count === max && s.count > 0).map(s => s.date);
  }

  function getDateScore(scheduleId: string, date: string): { count: number; names: string[] } {
    const r = responses[scheduleId] ?? [];
    const available = r.filter(x => x.available_dates.includes(date));
    return { count: available.length, names: available.map(x => x.player_name) };
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-4)' }}>
      <div className="spinner" style={{ width: 14, height: 14 }} />
      <span className="loading-text">Loading scheduler…</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', margin: 0 }}>
            Find a time that works for everyone. Players click dates they're available.
          </p>
        </div>
        {isOwner && (
          <button className="btn-gold btn-sm" onClick={() => setShowCreate(true)}>
            + New Poll
          </button>
        )}
      </div>

      {/* Active schedules */}
      {schedules.filter(s => s.status === 'polling').map(schedule => {
        const allRes = responses[schedule.id] ?? [];
        const myDates = myResponse[schedule.id] ?? [];
        const best = getBestDates(schedule);
        const totalRespondents = allRes.length;

        return (
          <div key={schedule.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-4)' }}>
              <div>
                <h4 style={{ marginBottom: 'var(--sp-1)' }}>{schedule.title}</h4>
                {schedule.description && <p style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>{schedule.description}</p>}
                {schedule.deadline && (
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 4 }}>
                    Voting closes {new Date(schedule.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {totalRespondents} response{totalRespondents !== 1 ? 's' : ''}
                </span>
                {isOwner && (
                  <button className="btn-ghost btn-sm" onClick={() => cancelSchedule(schedule.id)} style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)' }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Best date banner */}
            {best.length > 0 && totalRespondents > 1 && (
              <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 'var(--r-md)', marginBottom: 'var(--sp-3)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)' }}>
                ⭐ Best option{best.length > 1 ? 's' : ''}: {best.map(d => formatDate(d)).join(', ')} — {getDateScore(schedule.id, best[0]).count}/{totalRespondents} available
              </div>
            )}

            {/* Date grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {schedule.proposed_dates.map(date => {
                const { count, names } = getDateScore(schedule.id, date);
                const isMine = myDates.includes(date);
                const isBest = best.includes(date);
                const pct = totalRespondents > 0 ? count / totalRespondents : 0;
                const barColor = pct === 1 ? 'var(--hp-full)' : pct >= 0.6 ? 'var(--c-gold)' : pct > 0 ? 'var(--c-gold)' : 'var(--c-raised)';

                return (
                  <div key={date} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                    padding: 'var(--sp-2) var(--sp-3)',
                    borderRadius: 'var(--r-md)',
                    border: `1px solid ${isBest && totalRespondents > 1 ? 'rgba(212,160,23,0.4)' : 'var(--c-border)'}`,
                    background: isBest && totalRespondents > 1 ? 'rgba(212,160,23,0.05)' : '#080d14',
                  }}>
                    {/* Availability toggle */}
                    <button
                      onClick={() => toggleAvailability(schedule.id, date)}
                      style={{
                        width: 28, height: 28, borderRadius: 'var(--r-sm)', flexShrink: 0,
                        border: `2px solid ${isMine ? 'var(--hp-full)' : 'var(--c-border-m)'}`,
                        background: isMine ? 'rgba(52,211,153,0.15)' : 'transparent',
                        cursor: 'pointer', transition: 'all var(--tr-fast)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14,
                      }}
                      title={isMine ? 'Click to mark unavailable' : 'Click to mark available'}
                    >
                      {isMine ? '✓' : ''}
                    </button>

                    {/* Date label */}
                    <div style={{ minWidth: 110, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', fontWeight: isBest ? 600 : 400, color: isBest ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                      {formatDate(date)}
                    </div>

                    {/* Availability bar */}
                    <div style={{ flex: 1, height: 6, background: 'var(--c-raised)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, borderRadius: 999, transition: 'width var(--tr-normal)' }} />
                    </div>

                    {/* Count + names */}
                    <div style={{ minWidth: 80, textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', fontWeight: 700, color: barColor }}>
                        {count}/{totalRespondents}
                      </span>
                      {names.length > 0 && (
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                          {names.join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Confirm button (DM only) */}
                    {isOwner && count > 0 && (
                      <button
                        className="btn-sm btn-gold"
                        onClick={() => confirmDate(schedule.id, date)}
                        style={{ flexShrink: 0, fontSize: 10 }}
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Confirmed sessions */}
      {schedules.filter(s => s.status === 'confirmed').map(schedule => (
        <div key={schedule.id} style={{ padding: 'var(--sp-4)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 'var(--r-lg)', background: 'rgba(52,211,153,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--hp-full)', marginBottom: 2 }}>
                ✅ {schedule.title} — Confirmed
              </div>
              {schedule.confirmed_date && (
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
                  {new Date(schedule.confirmed_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}
            </div>
            {isOwner && (
              <button className="btn-ghost btn-sm" style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)' }}
                onClick={() => supabase.from('session_schedules').update({ status: 'polling', confirmed_date: null }).eq('id', schedule.id).then(() => loadSchedules())}>
                Reopen
              </button>
            )}
          </div>
        </div>
      ))}

      {schedules.filter(s => s.status === 'polling').length === 0 && schedules.filter(s => s.status === 'confirmed').length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
          No scheduling polls yet.{isOwner ? ' Create one to find the best time for your party.' : ' Ask your DM to start a scheduling poll.'}
        </div>
      )}

      {/* Create poll modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          {/* v2.164.0 — Phase Q.0 pt 5: bumped maxWidth 520 → 760.
              The 14 proposed-date pills wrap into many cramped rows
              at 520px; 760px lets them breathe and stay scannable. */}
          <div className="modal" style={{ maxWidth: 760, width: '92vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>New Scheduling Poll</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div>
                <label>Poll Title</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Next Session" autoFocus />
              </div>
              <div>
                <label>Description (optional)</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Any notes for players..." />
              </div>
              <div>
                <label>Voting Deadline</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label>Proposed Dates ({selectedDays.length} selected — click to toggle)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                  {getNextDays(14).map(d => {
                    const selected = selectedDays.includes(d);
                    return (
                      <button key={d}
                        onClick={() => setSelectedDays(prev => selected ? prev.filter(x => x !== d) : [...prev, d])}
                        style={{
                          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600,
                          padding: '4px 10px', borderRadius: 999,
                          border: `1px solid ${selected ? 'var(--c-gold)' : 'var(--c-border)'}`,
                          background: selected ? 'rgba(212,160,23,0.12)' : 'transparent',
                          color: selected ? 'var(--c-gold-l)' : 'var(--t-2)',
                          cursor: 'pointer',
                        }}
                      >
                        {formatDate(d)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-gold" onClick={createSchedule} disabled={saving || selectedDays.length < 2 || !newTitle.trim()}>
                {saving ? 'Creating…' : 'Create Poll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
