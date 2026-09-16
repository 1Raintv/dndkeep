import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Character } from '../../types';
import { updateCharacter } from '../supabase';
import { createPatchQueue } from '../patchQueue';

// v2.695.0 — Account + character scoped, outside React: route unmounts must
// not abandon a slow save or a recoverable failure. Only patches are retained.
const queues = new Map<string, ReturnType<typeof createPatchQueue<Character>>>();
let unloadGuardInstalled = false;
let revision = 0;
const registryListeners = new Set<() => void>();
const subscribeRegistry = (listener: () => void) => {
  registryListeners.add(listener);
  return () => { registryListeners.delete(listener); };
};
const registrySnapshot = () => revision;

function getQueue(userId: string, characterId: string) {
  const key = JSON.stringify([userId, characterId]);
  let queue = queues.get(key);
  if (!queue) {
    queue = createPatchQueue<Character>(patch => updateCharacter(
      characterId, patch as Parameters<typeof updateCharacter>[1],
    ));
    queues.set(key, queue);
    queue.subscribe(() => {
      revision += 1;
      registryListeners.forEach(listener => listener());
    });
  }
  if (!unloadGuardInstalled && typeof window !== 'undefined') {
    unloadGuardInstalled = true;
    window.addEventListener('beforeunload', event => {
      if (![...queues.values()].some(value => value.getSnapshot().pending)) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }
  return queue;
}

export function useCharacterSaveFailures(userId: string) {
  useSyncExternalStore(subscribeRegistry, registrySnapshot);
  return [...queues.entries()].flatMap(([key, queue]) => {
    const [accountId, characterId] = JSON.parse(key) as [string, string];
    return accountId === userId && queue.getSnapshot().error ? [characterId] : [];
  });
}

export function useCharacterSaves(userId: string, characterId: string) {
  const queue = useMemo(() => getQueue(userId, characterId), [userId, characterId]);
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  useEffect(() => () => {
    // Failed requests need an explicit retry, not a surprise replay on exit.
    if (!queue.getSnapshot().error) void queue.flush();
  }, [queue]);
  return { queue, ...state };
}
