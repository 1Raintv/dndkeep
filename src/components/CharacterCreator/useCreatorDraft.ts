import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { clearCreatorDraft, emptyCreatorDraft, readCreatorDraft, writeCreatorDraft, type CreatorDraft } from './creatorDraft';

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function useCreatorDraft(userId: string) {
  const [saved] = useState(() => {
    const target = storage();
    return target ? readCreatorDraft(target, userId) : null;
  });
  const [needsResume, setNeedsResume] = useState(saved !== null);
  const [draft, setDraft] = useState(emptyCreatorDraft);
  const [storageError, setStorageError] = useState<string | null>(null);
  const completed = useRef(false);

  useEffect(() => {
    if (needsResume || completed.current) return;
    // Opening and cancelling an untouched wizard should not create a draft.
    if (JSON.stringify(draft) === JSON.stringify(emptyCreatorDraft())) return;
    const target = storage();
    const ok = target && writeCreatorDraft(target, userId, draft);
    setStorageError(ok ? null : 'Draft could not be saved on this device. Keep this page open until you create your character.');
  }, [draft, needsResume, userId]);

  function field<K extends keyof CreatorDraft>(key: K) {
    return (action: SetStateAction<CreatorDraft[K]>) => setDraft(previous => ({
      ...previous,
      [key]: typeof action === 'function'
        ? (action as (value: CreatorDraft[K]) => CreatorDraft[K])(previous[key]) : action,
    }));
  }

  function clear() {
    const target = storage();
    return target !== null && clearCreatorDraft(target, userId);
  }

  return {
    draft, field, saved, needsResume, storageError,
    resume() { if (saved) setDraft(saved); setNeedsResume(false); },
    discard() {
      if (!clear()) {
        setStorageError('Could not discard the saved draft. Try again, or resume it.');
        return;
      }
      setDraft(emptyCreatorDraft());
      setStorageError(null);
      setNeedsResume(false);
    },
    complete() {
      completed.current = true; // The final saving-state render must not recreate it.
      return clear();
    },
  };
}
