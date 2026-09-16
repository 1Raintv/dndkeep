// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Profile } from '../types';
vi.mock('../lib/supabase', () => ({
  getProfile: vi.fn(),
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));
import { getProfile, supabase } from '../lib/supabase';
import { AuthProvider, useAuth } from './AuthContext';

let event: (event: AuthChangeEvent, session: Session | null) => void;
const session = (id: string) => ({ user: { id } }) as Session;
const profile = (id: string) => ({ id, show_ua_content: true }) as Profile;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session('a') }, error: null });
  vi.mocked(getProfile).mockResolvedValue({ data: profile('a'), error: null });
  vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(callback => {
    event = callback;
    return { data: { subscription: { id: 'test', callback, unsubscribe: vi.fn() } } };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function start() {
  const hook = renderHook(useAuth, { wrapper: AuthProvider });
  await act(async () => {});
  return hook;
}

it('ends loading for a missing profile and supports retry', async () => {
  vi.mocked(getProfile).mockResolvedValueOnce({ data: null, error: null });
  const { result } = await start();
  expect(result.current.profileLoading).toBe(false);
  expect(result.current.profile).toBeNull();
  await act(() => result.current.refreshProfile());
  expect(result.current.profile?.id).toBe('a');
});
it('bounds hung profile requests and ignores late success after timeout', async () => {
  const pending = deferred<Awaited<ReturnType<typeof getProfile>>>();
  vi.mocked(getProfile).mockReturnValue(pending.promise);
  const { result } = await start();
  expect(result.current.profileLoading).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(12000));
  expect(result.current.profileLoading).toBe(false);
  await act(async () => pending.resolve({ data: profile('a'), error: null }));
  expect(result.current.profile).toBeNull();
});
it('discards the previous account response and its grants', async () => {
  const old = deferred<Awaited<ReturnType<typeof getProfile>>>();
  vi.mocked(getProfile).mockReturnValueOnce(old.promise);
  const { result } = await start();
  vi.mocked(getProfile).mockResolvedValue({ data: { ...profile('b'), show_ua_content: false }, error: null });
  await act(async () => event('SIGNED_IN', session('b')));
  await act(async () => old.resolve({ data: profile('a'), error: null }));
  expect(result.current.profile?.id).toBe('b');
  expect(result.current.showUaContent).toBe(false);
});
it('cannot restore a profile after sign-out', async () => {
  const old = deferred<Awaited<ReturnType<typeof getProfile>>>();
  vi.mocked(getProfile).mockReturnValue(old.promise);
  const { result } = await start();
  await act(async () => event('SIGNED_OUT', null));
  await act(async () => old.resolve({ data: profile('a'), error: null }));
  expect(result.current.user).toBeNull();
  expect(result.current.profile).toBeNull();
  expect(result.current.profileLoading).toBe(false);
});
it('does not let an older session read overwrite a newer auth event', async () => {
  const old = deferred<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
  vi.mocked(supabase.auth.getSession).mockReturnValue(old.promise);
  const { result } = await start();
  await act(async () => event('SIGNED_OUT', null));
  await act(async () => old.resolve({ data: { session: session('a') }, error: null }));
  expect(result.current.user).toBeNull();
  expect(result.current.loading).toBe(false);
});
it('surfaces session failures and recovers through retry', async () => {
  vi.mocked(supabase.auth.getSession).mockRejectedValueOnce(new Error('offline'));
  const { result } = await start();
  expect(result.current.initError).toBe(true);
  await act(async () => result.current.retryInit());
  expect(result.current.initError).toBe(false);
  expect(result.current.profile?.id).toBe('a');
});
