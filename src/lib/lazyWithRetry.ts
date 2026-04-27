// v2.330.0 — B1 fix: blank screens on route navigation.
//
// Root cause: React's lazy() permanently rejects on first import failure.
// If a chunk fetch ever fails (transient network blip, or — most commonly
// — the user has a tab open while a deploy bumps every chunk hash, so the
// in-memory cache references chunks that no longer exist on the CDN), the
// promise rejects once and stays rejected forever. Subsequent navigations
// to that route then render NOTHING (no fallback, no error UI) because
// React just throws a rejected promise that has nowhere to go.
//
// Symptom the user reports: "switching between DM campaign and homebrew
// leads to a blank screen and then you have to manually refresh the page."
// A hard refresh works because it resets the lazy() promise cache.
//
// Two layers of recovery:
//   1) Per-import: wrap the dynamic import in a 3-attempt retry with
//      exponential-ish backoff. Handles transient flakes.
//   2) Stale-hash safety net: if all retries fail AND we haven't already
//      attempted a forced reload this session, force a one-time hard
//      reload via window.location.reload(). The session flag prevents
//      reload loops if the chunk genuinely doesn't exist (e.g. dev
//      server is down). The second time we land on the bad path in the
//      same session, we re-throw and let the ErrorBoundary handle it.
//
// We also intentionally re-evaluate the factory on each retry — calling
// `factory()` returns a fresh import() promise every time, which is what
// we want. Caching the rejected promise is the bug we're fixing.

import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'dndkeep:lazy-reloaded';

/**
 * Drop-in replacement for React.lazy() that retries failed chunk imports
 * and falls back to a single hard reload on persistent failure (typically
 * caused by a deploy invalidating chunk hashes mid-session).
 *
 * Use exactly like lazy():
 *   const HomebrewPage = lazyWithRetry(() => import('./pages/HomebrewPage'));
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy<T>(async () => {
    const delays = [0, 300, 800, 1500]; // first attempt is immediate
    let lastErr: unknown = null;

    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) {
        await new Promise(r => setTimeout(r, delays[i]));
      }
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        // Don't retry on errors that aren't chunk loads — that means
        // the module itself crashed during evaluation, retrying won't
        // change anything. Match the patterns Vite/webpack emit.
        const msg = err instanceof Error ? err.message : String(err);
        const isChunkError =
          /loading chunk/i.test(msg) ||
          /loading css chunk/i.test(msg) ||
          /failed to fetch dynamically imported module/i.test(msg) ||
          /importing a module script failed/i.test(msg);
        if (!isChunkError) throw err;
      }
    }

    // All retries exhausted. If this is the first time this session,
    // assume a deploy nuked our chunks and force a fresh load. The
    // session flag stops us from looping — if we already reloaded
    // and STILL can't load, something is genuinely broken and we
    // should let the ErrorBoundary surface the error.
    try {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        // Microtask delay so any in-flight React work settles first.
        // The reload throws the rejected import in the bin and starts
        // fresh against the new index.html + new chunk hashes.
        window.location.reload();
        // Return a never-resolving promise so React doesn't render
        // anything between now and the reload taking effect.
        return await new Promise<never>(() => {});
      }
    } catch {
      // sessionStorage can throw in private mode / sandboxed iframes —
      // fall through to re-throwing the original error.
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  });
}

/**
 * Call once on a successful render to clear the reload-loop guard.
 * If we got here, chunks loaded fine, so it's safe for a future
 * stale-hash event to trigger another reload attempt later.
 */
export function clearLazyReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore — non-critical */
  }
}
