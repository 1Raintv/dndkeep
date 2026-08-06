// Unit tests for the auth-error humanizer (v2.648). Pure module — no
// supabase import, so nothing here can reach a database.
import { describe, expect, it } from 'vitest';
import { friendlyAuthError, isLocalSupabase, isNetworkError, unreachableMessage } from './authErrors';

describe('isLocalSupabase', () => {
  it('recognizes the local Docker stack', () => {
    expect(isLocalSupabase('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalSupabase('http://localhost:54321')).toBe(true);
    expect(isLocalSupabase('http://[::1]:54321')).toBe(true);
  });

  it('treats a hosted project as remote', () => {
    expect(isLocalSupabase('https://abcdefgh.supabase.co')).toBe(false);
    expect(isLocalSupabase('')).toBe(false);
    // hostname must be the local one, not merely contain it
    expect(isLocalSupabase('https://localhost.evil.example')).toBe(false);
  });
});

describe('isNetworkError', () => {
  it('detects every browser wording for a dead request', () => {
    for (const message of [
      'Failed to fetch',                                   // Chrome
      'Load failed',                                       // Safari
      'NetworkError when attempting to fetch resource.',   // Firefox
      'fetch failed',                                      // undici
      'Network request failed',
    ]) {
      expect(isNetworkError({ message })).toBe(true);
    }
  });

  it("detects supabase-js's retryable fetch error", () => {
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: '', status: 0 })).toBe(true);
  });

  it('does NOT treat a real server rejection as a network failure', () => {
    expect(isNetworkError({ message: 'Invalid login credentials', status: 400 })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('friendlyAuthError', () => {
  it('turns a dead backend into actionable guidance', () => {
    const msg = friendlyAuthError({ message: 'Failed to fetch' });
    expect(msg).toBe(unreachableMessage());
    expect(msg).toMatch(/can't reach/i);
  });

  it('names Docker + supabase start when the build points at a local stack', () => {
    expect(unreachableMessage('http://127.0.0.1:54321')).toMatch(/Docker Desktop/);
    expect(unreachableMessage('http://127.0.0.1:54321')).toMatch(/supabase start/);
  });

  it('keeps the hosted copy free of local-dev instructions', () => {
    const remote = unreachableMessage('https://abcdefgh.supabase.co');
    expect(remote).not.toMatch(/Docker/);
    expect(remote).toMatch(/internet connection/i);
  });

  it('rewrites the common credential failures', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials', status: 400 }))
      .toMatch(/don't match an account/);
    expect(friendlyAuthError({ message: 'Email not confirmed', status: 400 }))
      .toMatch(/needs confirming/);
    expect(friendlyAuthError({ message: 'User already registered', status: 422 }))
      .toMatch(/already exists/);
    expect(friendlyAuthError({ message: 'For security purposes, you can only request this after 42 seconds', status: 429 }))
      .toMatch(/Too many attempts/);
  });

  it('passes unknown messages through rather than hiding them', () => {
    expect(friendlyAuthError({ message: 'Signups not allowed for this instance', status: 422 }))
      .toBe('Signups not allowed for this instance');
    expect(friendlyAuthError(null)).toMatch(/Something went wrong/);
  });
});
