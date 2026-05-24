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

// v2.502.0 — Reload-loop guard, rewritten.
//
// The pre-v2.502 guard was a single boolean session flag
// ('dndkeep:lazy-reloaded') set before a force-reload and cleared by
// App.tsx's mount effect (clearLazyReloadGuard). That design assumed
// the FAILING chunk is a route that fails BEFORE the app shell mounts
// — so if the shell mounted, the bad chunk must have recovered, and
// it was safe to re-arm the guard.
//
// That assumption is wrong for chunks that load AFTER a successful
// shell mount (useSpells, ActionLog, encumbrance, campaignImmunities,
// etc. — lazy sub-imports inside the character sheet / campaign views,
// not top-level routes). Sequence of the v2.501 incident:
//   1. App shell mounts fine → clearLazyReloadGuard() clears the flag.
//   2. User opens a character → a lazy sub-chunk 404s (deploy mid-
//      propagation) → retries exhaust → guard is clear → reload.
//   3. Shell mounts again → flag cleared again.
//   4. Open character → 404 → reload → ∞.
// The "clear on mount" step re-armed the loop every cycle.
//
// New design: a timestamped reload LEDGER in sessionStorage. Each
// forced reload appends a timestamp. Before forcing a reload we count
// how many happened in the last RELOAD_WINDOW_MS; if we're at or over
// RELOAD_MAX, we stop reloading and re-throw so the ErrorBoundary
// shows its recovery UI. Old entries naturally age out of the window,
// so a single deploy blip (which causes one reload) never trips the
// limit, but a genuine loop (chunk truly missing) trips it within
// seconds and surfaces the error instead of spinning forever.
//
// clearLazyReloadGuard() is now a no-op kept for API compatibility —
// the ledger self-expires, so nothing needs to clear it on mount.

const RELOAD_LEDGER = 'dndkeep:lazy-reload-ledger';
const RELOAD_WINDOW_MS = 30_000; // count reloads within the last 30s
const RELOAD_MAX = 2;            // allow at most 2 reloads per window

/** Read the reload timestamps still inside the active window. */
function recentReloads(now: number): number[] {
  try {
    const raw = sessionStorage.getItem(RELOAD_LEDGER);
    if (!raw) return [];
    const arr = JSON.parse(raw) as number[];
    if (!Array.isArray(arr)) return [];
    return arr.filter(t => typeof t === 'number' && now - t < RELOAD_WINDOW_MS);
  } catch {
    return [];
  }
}

/** Record a reload at `now`, pruning anything outside the window. */
function recordReload(now: number): void {
  try {
    const next = [...recentReloads(now), now];
    sessionStorage.setItem(RELOAD_LEDGER, JSON.stringify(next));
  } catch {
    /* private mode / sandbox — ignore; we just lose loop protection */
  }
}

/**
 * Drop-in replacement for React.lazy() that retries failed chunk imports
 * and falls back to a rate-limited hard reload on persistent failure
 * (typically caused by a deploy invalidating chunk hashes mid-session).
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

    // All retries exhausted. Decide whether to force a reload based on
    // how many reloads we've already done in the recent window. One
    // reload absorbs a normal deploy hash-bump; hitting RELOAD_MAX
    // means the chunk is genuinely unreachable and we should stop
    // looping and let the ErrorBoundary surface a recovery UI.
    try {
      const now = Date.now();
      const reloads = recentReloads(now);
      if (reloads.length < RELOAD_MAX) {
        recordReload(now);
        window.location.reload();
        // Never-resolving promise so React renders nothing until the
        // reload takes effect.
        return await new Promise<never>(() => {});
      }
      // Over the limit — fall through and re-throw to the ErrorBoundary.
    } catch {
      // sessionStorage can throw in private mode / sandboxed iframes —
      // fall through to re-throwing the original error.
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  });
}

/**
 * v2.502.0 — Now a no-op. The reload ledger self-expires via its
 * time window, so there's nothing to clear on successful mount.
 * Kept exported for API compatibility with App.tsx's existing call;
 * removing the call site is a separate cleanup. Deliberately does
 * NOT clear the ledger — clearing on mount is exactly the bug that
 * caused the v2.501 reload loop (the shell mounts fine while a
 * sub-chunk keeps failing, so "clear on mount" re-armed the loop
 * every cycle).
 */
export function clearLazyReloadGuard(): void {
  /* intentional no-op — see doc comment */
}
