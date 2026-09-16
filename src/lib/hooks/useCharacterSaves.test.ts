// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabase', () => ({ updateCharacter: vi.fn() }));
import { updateCharacter } from '../supabase';
import { useCharacterSaveFailures, useCharacterSaves } from './useCharacterSaves';

afterEach(cleanup);
describe('character save lifecycle', () => {
  it('keeps a failed patch after navigation and exposes it only to the same account', async () => {
    const write = vi.mocked(updateCharacter);
    write.mockResolvedValueOnce({ data: null, error: { message: 'Offline' } } as Awaited<ReturnType<typeof updateCharacter>>);
    const first = renderHook(() => useCharacterSaves('alice', 'hero'));
    await act(async () => {
      first.result.current.queue.enqueue({ notes: 'Remember this' });
      await first.result.current.queue.flush();
    });
    first.unmount();
    const resumed = renderHook(() => useCharacterSaves('alice', 'hero'));
    expect(resumed.result.current.queue.getPending()).toEqual({ notes: 'Remember this' });
    const failures = renderHook(() => useCharacterSaveFailures('alice'));
    const otherAccount = renderHook(() => useCharacterSaveFailures('bob'));
    expect(failures.result.current).toEqual(['hero']);
    expect(otherAccount.result.current).toEqual([]);
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    write.mockResolvedValueOnce({ data: { id: 'hero' }, error: null, count: null, status: 200, statusText: 'OK' } as Awaited<ReturnType<typeof updateCharacter>>);
    await act(async () => { await resumed.result.current.queue.flush(); });
    expect(failures.result.current).toEqual([]);
    const savedClose = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(savedClose);
    expect(savedClose.defaultPrevented).toBe(false);
  });
});
