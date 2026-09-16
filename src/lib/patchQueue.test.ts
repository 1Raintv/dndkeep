import { describe, expect, it, vi } from 'vitest';
import { createPatchQueue } from './patchQueue';

type Sheet = { hp: number; notes: string };
function deferred() {
  let resolve!: (value: { error: { message: string } | null }) => void;
  const promise = new Promise<{ error: { message: string } | null }>(r => { resolve = r; });
  return { promise, resolve };
}

describe('character patch queue', () => {
  it('drains edits arriving during a slow request, even with no later interaction', async () => {
    const first = deferred();
    const write = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    const queue = createPatchQueue<Sheet>(write);
    queue.enqueue({ hp: 8 });
    const done = queue.flush();
    await Promise.resolve();
    queue.enqueue({ notes: 'Second edit' });
    expect(queue.flush()).toBe(done);
    expect(write).toHaveBeenCalledTimes(1);
    first.resolve({ error: null });
    await done;
    expect(write.mock.calls).toEqual([[{ hp: 8 }], [{ notes: 'Second edit' }]]);
    expect(queue.getSnapshot()).toEqual({ saving: false, pending: false, error: null });
  });

  it('retains failed fields while newer values win when retrying', async () => {
    const first = deferred();
    const write = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    const queue = createPatchQueue<Sheet>(write);
    queue.enqueue({ hp: 8, notes: 'Keep me' });
    const done = queue.flush();
    await Promise.resolve();
    queue.enqueue({ hp: 6 });
    first.resolve({ error: { message: 'Offline' } });
    await done;
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()).toEqual({ saving: false, pending: true, error: 'Offline' });
    expect(queue.getPending()).toEqual({ hp: 6, notes: 'Keep me' });
    await queue.flush();
    expect(write).toHaveBeenLastCalledWith({ hp: 6, notes: 'Keep me' });
  });

  it('recovers a thrown request without a retry loop', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValue({ error: null });
    const queue = createPatchQueue<Sheet>(write);
    queue.enqueue({ hp: 0 });
    await queue.flush();
    expect(queue.getPending()).toEqual({ hp: 0 });
    expect(write).toHaveBeenCalledTimes(1);
    await queue.flush();
    expect(queue.getSnapshot().pending).toBe(false);
  });

  it('continues draining after its view unsubscribes', async () => {
    const first = deferred();
    const write = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ error: null });
    const queue = createPatchQueue<Sheet>(write);
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    queue.enqueue({ hp: 10 });
    const done = queue.flush();
    await Promise.resolve();
    queue.enqueue({ notes: 'Leaving page' });
    unsubscribe();
    listener.mockClear();
    first.resolve({ error: null });
    await done;
    expect(write).toHaveBeenLastCalledWith({ notes: 'Leaving page' });
    expect(listener).not.toHaveBeenCalled();
  });
});
