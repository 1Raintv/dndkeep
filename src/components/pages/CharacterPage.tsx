import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getCharacter, subscribeToCharacter, supabase } from '../../lib/supabase';
import CharacterSheet from '../CharacterSheet';

export default function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isPro } = useAuth();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div style={{ padding: 'var(--sp-8)' }}>
        <p style={{ color: 'var(--c-red-l)', marginBottom: 'var(--sp-4)' }}>
          {error ?? 'Character not found.'}
        </p>
        <button className="btn-secondary" onClick={() => navigate('/lobby')}>
          Back to Characters
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
            gap: 'var(--sp-1)',
            color: 'var(--c-gold)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hp-full)', display: 'inline-block' }} />
            Live sync active
          </span>
        )}
      </div>

      <CharacterSheet
        initialCharacter={character}
        realtimeEnabled={isPro}
        isPro={isPro}
        userId={user?.id ?? ''}
      />
    </div>
  );
}
