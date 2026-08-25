// v2.680.0 — Capture *why* the browser landed here, before the Supabase
// client destroys the evidence.
//
// THE PROBLEM. The client is created with `detectSessionInUrl: true`
// (src/lib/supabase.ts). When someone opens a Supabase invite or
// password-recovery email link, they arrive at the site root with the
// token in the URL fragment:
//
//   https://dndkeep.app/#access_token=...&type=invite
//
// supabase-js consumes that fragment on construction, exchanges it for a
// session, and then *clears the hash*. By the time any React component
// renders, `window.location.hash` is empty and the only observable fact
// is "there is a session" — indistinguishable from a normal returning
// user. `HomeRedirect` would therefore send an invited user straight to
// /lobby, and they would never be asked to choose a password. They get
// exactly one session and can never sign in again.
//
// THE FIX. Read the fragment at module-evaluation time and stash the
// `type`. This module is imported by `supabase.ts` *above* its
// `createClient` call: ES module bodies evaluate before the body of the
// module that imports them, so this always runs first. That import is
// load-bearing — see the note there before removing it.
//
// The value is also mirrored into sessionStorage because Supabase's
// recovery flow can bounce through a redirect before the app settles,
// and a module-level variable does not survive that.

/** Why the user landed on the app from an emailed auth link. */
export type AuthLandingType = 'invite' | 'recovery' | null;

const STORAGE_KEY = 'dndkeep.authLanding';

/** Pull the `type` out of a URL fragment, if it names one we act on.
 *  Exported for tests; the fragment may or may not carry a leading '#'. */
export function parseAuthLandingType(hash: string): AuthLandingType {
  if (!hash) return null;
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  // An error fragment (expired link, already used) carries no usable
  // token — treat it as a normal landing so the user sees the sign-in
  // page and its "email me a link" affordance rather than a password
  // form that cannot submit.
  if (params.get('error') || params.get('error_code')) return null;
  if (!params.get('access_token')) return null;
  const type = params.get('type');
  return type === 'invite' || type === 'recovery' ? type : null;
}

/** Read from sessionStorage, tolerating environments that throw on access
 *  (Safari private mode, embedded webviews). Never let storage break auth. */
function readStored(): AuthLandingType {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === 'invite' || v === 'recovery' ? v : null;
  } catch { return null; }
}

function writeStored(v: AuthLandingType): void {
  try {
    if (v) sessionStorage.setItem(STORAGE_KEY, v);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable — the in-memory value still works */ }
}

// Captured once, at import time, before createClient() runs.
let captured: AuthLandingType = null;
if (typeof window !== 'undefined') {
  captured = parseAuthLandingType(window.location.hash);
  if (captured) writeStored(captured);
  else captured = readStored();
}

/** What kind of emailed link brought the user here, if any. Non-destructive —
 *  safe to call from render. */
export function peekAuthLanding(): AuthLandingType {
  return captured ?? readStored();
}

/** Same, but clears the flag. Call once the user has actually finished
 *  setting a password, so a later reload doesn't re-trap them on the form. */
export function consumeAuthLanding(): AuthLandingType {
  const v = peekAuthLanding();
  captured = null;
  writeStored(null);
  return v;
}
