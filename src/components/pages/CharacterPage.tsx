import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getCharacter, subscribeToCharacter, supabase } from '../../lib/supabase';
import CharacterSheet from '../CharacterSheet';
import NotificationsButton from '../shared/NotificationsButton';
import NotificationToast, { type ToastItem } from '../shared/NotificationToast';

export default function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isPro } = useAuth();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // v2.161.0 — Phase Q.0 pt 2: notification toast state. Driven by
  // NotificationsButton.onNewArrival callback when a new realtime
  // notification lands.
  const [toastItem, setToastItem] = useState<ToastItem | null>(null);

  // v2.581.0 — breadcrumb campaign context. Shows which campaign the
  // character belongs to (click -> campaign page); if unassigned, an
  // inline join-code flow reusing the same RPC + assignment path as
  // the settings Campaign tab (join_campaign_by_code, then write
  // characters.campaign_id and update local state).
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const cid = character?.campaign_id;
    if (!cid) { setCampaignName(null); return; }
    let cancelled = false;
    supabase.from('campaigns').select('name').eq('id', cid).single()
      .then(({ data }) => { if (!cancelled) setCampaignName((data as { name: string } | null)?.name ?? null); });
    return () => { cancelled = true; };
  }, [character?.campaign_id]);

  // v2.582.0 — live combat indicator. Tracks whether the campaign has
  // an ACTIVE combat encounter; the Battle Map chip pulses red while
  // one is running. Initial fetch + realtime re-check on any
  // combat_encounters change for this campaign (insert/status flip/
  // delete all re-evaluate, so the pulse starts and stops live).
  const [combatActive, setCombatActive] = useState(false);
  useEffect(() => {
    const cid = character?.campaign_id;
    if (!cid) { setCombatActive(false); return; }
    let cancelled = false;
    const check = () => {
      supabase
        .from('combat_encounters')
        .select('id')
        .eq('campaign_id', cid)
        .eq('status', 'active')
        .limit(1)
        .then(({ data }) => { if (!cancelled) setCombatActive((data ?? []).length > 0); });
    };
    check();
    const ch = supabase
      .channel(`combat-status-${cid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'combat_encounters',
        filter: `campaign_id=eq.${cid}`,
      }, check)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [character?.campaign_id]);

  async function handleBreadcrumbJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code || !character) return;
    setJoining(true);
    setJoinError(null);
    try {
      // (supabase as any) — accepted codebase pattern; the generated
      // types don't cover this RPC.
      const { data, error: rpcErr } = await (supabase as any).rpc('join_campaign_by_code', { p_code: code });
      if (rpcErr) {
        if (rpcErr.code === 'P0002') setJoinError('No campaign matches that code.');
        else if (rpcErr.code === '22023') setJoinError('Enter a code first.');
        else setJoinError(rpcErr.message ?? 'Failed to join campaign.');
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.campaign_id) { setJoinError('Unexpected response from the server.'); return; }
      const { error: charErr } = await supabase
        .from('characters')
        .update({ campaign_id: row.campaign_id })
        .eq('id', character.id);
      if (charErr) {
        setJoinError(`Joined, but couldn't assign your character: ${charErr.message}`);
        return;
      }
      setCharacter(c => (c ? { ...c, campaign_id: row.campaign_id } : c));
      setShowJoin(false);
      setJoinCode('');
    } catch (e: any) {
      setJoinError(e?.message ?? 'Failed to join campaign.');
    } finally {
      setJoining(false);
    }
  }

  const handleRealtimeUpdate = useCallback((updated: Character) => {
    // Only accept updates for the right character
    if (updated.id === id) setCharacter(updated);
  }, [id]);

  useEffect(() => {
    if (!id) { navigate('/lobby'); return; }

    setLoading(true);
    getCharacter(id).then(({ data, error: err }) => {
      if (err || !data) {
        setError(err?.message ?? 'Character not found.');
      } else {
        // Guard: only the owner can view
        if (data.user_id !== user?.id) {
          setError('You do not have permission to view this character.');
        } else {
          setCharacter(data);
        }
      }
      setLoading(false);
    });

    // Pro users get real-time sync — DMs in the same campaign see HP/condition changes live
    if (!isPro) return;
    const channel = subscribeToCharacter(id, handleRealtimeUpdate);
    return () => { supabase.removeChannel(channel); };
  }, [id, user?.id, isPro, navigate, handleRealtimeUpdate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-8)' }}>
        <div className="spinner" />
        <span className="loading-text">Loading character...</span>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div style={{ padding: 'var(--sp-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-4)', textAlign: 'center', maxWidth: 400, margin: '80px auto' }}>
        <div style={{ fontSize: 48, opacity: 0.2 }}></div>
        <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--t-1)' }}>
          Character Not Found
        </div>
        <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
          This character may have been deleted or you may not have permission to view it.
        </p>
        <button className="btn-gold" onClick={() => navigate('/lobby')}>
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      {/* v2.587.0 — top bar evenly distributed: breadcrumb, campaign
          chip, battle map chip, and live-sync each sit as their own
          flex child under justify-content: space-between, so they
          spread across the full width with even empty space between.
          "Campaign:" now lives INSIDE the chip as part of the button. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--sp-3)',
        marginBottom: 'var(--sp-4)',
        fontFamily: 'var(--ff-body)',
        fontSize: 'var(--fs-xs)',
        color: 'var(--t-2)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minWidth: 0 }}>
          <button
            className="btn-ghost btn-sm"
            onClick={() => navigate('/lobby')}
            style={{ padding: '2px var(--sp-2)', fontSize: 'var(--fs-xs)' }}
          >
            Characters
          </button>
          <span>/</span>
          <span style={{ color: 'var(--t-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{character.name}</span>
        </span>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
        }}>
          {/* v2.581.0 — campaign context on the breadcrumb. In a
              campaign: "Campaign: {name}" as one chip, click ->
              campaign page. Not in one: "Join Campaign" expands an
              inline code input. */}
          {character.campaign_id ? (
            campaignName && (
              <button
                className="crumb-btn crumb-btn-gold"
                onClick={() => navigate(`/campaigns/${character.campaign_id}`)}
                title="Open this campaign"
                style={{ maxWidth: 300 }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-gold)', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: 'var(--t-3)', fontWeight: 700, flexShrink: 0 }}>Campaign:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaignName}</span>
              </button>
            )
          ) : showJoin ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value); if (joinError) setJoinError(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !joining) handleBreadcrumbJoin();
                  if (e.key === 'Escape') { setShowJoin(false); setJoinError(null); }
                }}
                placeholder="ABC123"
                autoFocus
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                style={{ width: 90, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 6px' }}
              />
              <button
                className="btn-gold btn-sm"
                onClick={handleBreadcrumbJoin}
                disabled={joining || !joinCode.trim()}
                style={{ padding: '2px var(--sp-2)', fontSize: 'var(--fs-xs)' }}
              >
                {joining ? 'Joining…' : 'Join'}
              </button>
              {joinError && (
                <span style={{ color: 'var(--c-red-l)', fontSize: 'var(--fs-xs)' }}>{joinError}</span>
              )}
            </span>
          ) : (
            <button
              className="crumb-btn crumb-btn-gold"
              onClick={() => setShowJoin(true)}
              title="Join a campaign with your DM's code"
            >
              Join Campaign
            </button>
          )}
        </span>
        {/* v2.580.0 — quick jump to the campaign's battle map from the
            breadcrumb line. Same destination as the sheet header's map
            button. Renders for any character in a campaign. Own flex
            child (v2.587.0) so the bar distributes evenly. */}
        {character.campaign_id && (
            <button
              className={combatActive ? 'crumb-btn crumb-btn-combat' : 'crumb-btn'}
              onClick={() => navigate(`/campaigns/${character.campaign_id}?tab=map`)}
              title={combatActive ? 'Combat in progress — open the battle map' : 'Open the current battle map'}
            >
              <span aria-hidden style={{ fontSize: 12 }}>⚔</span>
              Battle Map
            </button>
          )}
        {isPro && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            color: 'var(--c-gold)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hp-full)', display: 'inline-block' }} />
              Live sync active
            </span>
            {/* v2.161.0 — Phase Q.0 pt 2: notifications button.
                Only renders when the character is in a campaign
                (notification stream is per-campaign). */}
            <NotificationsButton
              campaignId={character.campaign_id ?? null}
              characterId={character.id}
              onNewArrival={msg => setToastItem(msg)}
            />
          </span>
        )}
      </div>

      {/* v2.161.0 — Phase Q.0 pt 2: transient toast for new
          notifications. Sits above all other content with
          pointer-events scoped to its own elements. */}
      <NotificationToast latest={toastItem} />

      <CharacterSheet
        initialCharacter={character}
        realtimeEnabled={isPro}
        isPro={isPro}
        userId={user?.id ?? ''}
        onLocalToast={setToastItem}
      />
    </div>
  );
}
