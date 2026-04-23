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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        marginBottom: 'var(--sp-4)',
        fontFamily: 'var(--ff-body)',
        fontSize: 'var(--fs-xs)',
        color: 'var(--t-2)',
      }}>
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate('/lobby')}
          style={{ padding: '2px var(--sp-2)', fontSize: 'var(--fs-xs)' }}
        >
          Characters
        </button>
        <span>/</span>
        <span style={{ color: 'var(--t-2)' }}>{character.name}</span>
        {isPro && (
          <span style={{
            marginLeft: 'auto',
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
