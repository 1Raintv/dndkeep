// v2.695.0 — Serialize partial writes. A failed batch stays recoverable;
// newer values win over older failed values, and success drains later edits.
export interface PatchQueueState {
  saving: boolean;
  pending: boolean;
  error: string | null;
}

export function createPatchQueue<T extends object>(
  write: (patch: Partial<T>) => Promise<{ error: { message: string } | null }>,
) {
  let pending: Partial<T> = {};
  let inFlight: Partial<T> = {};
  let running: Promise<void> | null = null;
  let state: PatchQueueState = { saving: false, pending: false, error: null };
  const listeners = new Set<() => void>();
  const publish = (saving: boolean, error: string | null) => {
    state = { saving, pending: Object.keys(pending).length > 0 || saving, error };
    listeners.forEach(listener => listener());
  };

  async function drain() {
    while (Object.keys(pending).length) {
      inFlight = pending;
      pending = {};
      publish(true, null);
      let failure: string | null = null;
      try {
        const result = await write(inFlight);
        failure = result.error?.message ?? null;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Save failed. Check your connection.';
      }
      if (failure !== null) {
        pending = { ...inFlight, ...pending };
        inFlight = {};
        publish(false, failure);
        return; // No automatic retry loop or stale replay after reconnect.
      }
      inFlight = {};
    }
    publish(false, null);
  }

  return {
    getSnapshot: () => state,
    getPending: (): Partial<T> => ({ ...inFlight, ...pending }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enqueue(patch: Partial<T>) {
      pending = { ...pending, ...patch };
      publish(state.saving, state.error);
    },
    flush() {
      // Schedule on a microtask so even a synchronous throw from write cannot
      // leave the queue permanently marked as running.
      if (!running) running = Promise.resolve().then(drain).finally(() => { running = null; });
      return running;
    },
  };
}
