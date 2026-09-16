import { Link, useLocation } from 'react-router-dom';
import { useCharacterSaveFailures } from '../../lib/hooks/useCharacterSaves';

// v2.695.0 — A request may fail after the sheet unmounts. Keep its recovery
// reachable across routes; the sheet itself owns the detailed Retry action.
export default function CharacterSaveNotice({ userId }: { userId: string }) {
  const failedIds = useCharacterSaveFailures(userId);
  const { pathname } = useLocation();
  const otherFailures = failedIds.filter(id => pathname !== `/character/${id}`);
  if (!otherFailures.length) return null;
  return (
    <div role="alert" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', border: '1px solid var(--c-red-l)', borderRadius: 'var(--r-md)', color: 'var(--t-1)' }}>
      <p style={{ margin: '0 0 8px' }}>Character changes haven't saved. Keep this tab open and return to the sheet to retry.</p>
      {otherFailures.map((id, index) => (
        <Link key={id} to={`/character/${id}`} style={{ display: 'inline-block', padding: '8px 12px', color: 'var(--c-gold-l)' }}>
          {otherFailures.length === 1 ? 'Return to character' : `Review unsaved character ${index + 1}`}
        </Link>
      ))}
    </div>
  );
}
