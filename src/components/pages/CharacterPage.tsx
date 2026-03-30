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
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', padding: 'var(--space-8)' }}>
        <div className="spinner" />
        <span className="loading-text">Loading character...</span>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <p style={{ color: 'var(--color-crimson-bright)', marginBottom: 'var(--space-4)' }}>
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
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-4)',
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
      }}>
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate('/lobby')}
          style={{ padding: '2px var(--space-2)', fontSize: 'var(--text-xs)' }}
        >
          Characters
        </button>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{character.name}</span>
        {isPro && (
          <span style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            color: 'var(--color-gold-dim)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hp-full)', display: 'inline-block' }} />
            Live sync active
          </span>
        )}
      </div>

      <CharacterSheet
        initialCharacter={character}
        realtimeEnabled={isPro}
      />
    </div>
  );
}
