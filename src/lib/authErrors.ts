// v2.648.0 — Human-readable auth failures.
//
// Supabase's auth errors reach the UI raw, and the worst of them is the
// one that means "the server never answered": browsers word it as
// "Failed to fetch" / "Load failed" / "NetworkError when attempting to
// fetch resource", which reads to a user like the app is broken. The
// most common cause on a dev machine is the local Docker stack being
// down — the fix is `npx supabase start`, and the error should just say
// so rather than making you go and find that out.
//
// Pure module: no supabase import, no components. Consumers pass the
// error object they already have.

/** Shape we can get from supabase-js (AuthError) or a thrown TypeError. */
export interface AuthErrorLike {
  message?: string;
  status?: number;
  name?: string;
}

/** The Supabase URL this build talks to. Read once at module scope —
 *  it's a build-time constant, not runtime state. */
const CONFIGURED_URL = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '';

/** Is the configured backend a local dev stack (Docker) rather than the
 *  hosted project? Drives the "is Docker running?" hint. */
export function isLocalSupabase(url: string = CONFIGURED_URL): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(url.trim());
}

// Browser + runtime wordings for "the request never reached a server".
// Chrome: 'Failed to fetch' · Safari: 'Load failed' · Firefox:
// 'NetworkError when attempting to fetch resource.' · undici: 'fetch
// failed' · supabase-js retry wrapper: AuthRetryableFetchError w/ status 0.
const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /load failed/i,
  /networkerror/i,
  /fetch failed/i,
  /network request failed/i,
  /err_connection/i,
  /timeout|timed out/i,
];

/** True when the failure is transport-level — nothing answered — as
 *  opposed to the server rejecting the credentials. */
export function isNetworkError(err: AuthErrorLike | null | undefined): boolean {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  // gotrue reports a real HTTP status for real answers; 0/undefined with
  // a fetch-shaped message means the request never landed.
  if (typeof err.status === 'number' && err.status > 0) return false;
  const msg = err.message ?? '';
  return NETWORK_PATTERNS.some(p => p.test(msg));
}

/** The "can't reach the backend" copy, tailored to which backend this
 *  build points at. Exported on its own so non-auth surfaces (the app's
 *  unreachable-on-boot gate) can show the same guidance. */
export function unreachableMessage(url: string = CONFIGURED_URL): string {
  if (isLocalSupabase(url)) {
    return `Can't reach the local Supabase stack at ${url}. Start Docker Desktop, then run "npx supabase start" ` +
      '— or delete .env.local to use the hosted database instead.';
  }
  return "Can't reach the server. Check your internet connection and try again in a moment.";
}

/** Turn an auth error into something worth showing a person.
 *  Falls through to the original message when we have nothing better —
 *  never swallow an error into a vague "something went wrong". */
export function friendlyAuthError(err: AuthErrorLike | null | undefined): string {
  if (!err) return 'Something went wrong. Please try again.';
  if (isNetworkError(err)) return unreachableMessage();

  const msg = err.message ?? '';

  if (/invalid login credentials/i.test(msg)) {
    return "That email and password don't match an account. Check for typos, or create an account below.";
  }
  if (/email not confirmed/i.test(msg)) {
    return 'This account still needs confirming — click the link in the confirmation email, then sign in.';
  }
  if (/user already registered|already been registered/i.test(msg)) {
    return 'An account with that email already exists — switch to Sign In.';
  }
  if (err.status === 429 || /for security purposes|rate limit|too many/i.test(msg)) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (/password should be at least/i.test(msg)) {
    return 'Password is too short — use at least 8 characters.';
  }

  return msg || 'Something went wrong. Please try again.';
}
