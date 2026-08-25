import { describe, it, expect } from 'vitest';
import { parseAuthLandingType } from './authLanding';

// v2.680.0 — The parser is the whole safety property: get it wrong and an
// invited user is either trapped on a password form forever (false
// positive) or silently dropped into the app with no password they can
// ever sign in with again (false negative).

describe('parseAuthLandingType', () => {
  it('recognises an invite link', () => {
    expect(parseAuthLandingType('#access_token=abc&type=invite')).toBe('invite');
  });

  it('recognises a recovery link', () => {
    expect(parseAuthLandingType('#access_token=abc&type=recovery')).toBe('recovery');
  });

  it('tolerates a fragment with no leading hash', () => {
    expect(parseAuthLandingType('access_token=abc&type=invite')).toBe('invite');
  });

  it('ignores an ordinary landing', () => {
    expect(parseAuthLandingType('')).toBeNull();
    expect(parseAuthLandingType('#')).toBeNull();
  });

  it('ignores link types we do not gate on', () => {
    // A signup-confirmation link is a normal sign-in, not a password set.
    expect(parseAuthLandingType('#access_token=abc&type=signup')).toBeNull();
    expect(parseAuthLandingType('#access_token=abc&type=magiclink')).toBeNull();
  });

  it('requires an access token — a bare type is not a landing', () => {
    // Anyone can put #type=recovery in the address bar. Without a token
    // there is no session to act on, so it must not open the form.
    expect(parseAuthLandingType('#type=recovery')).toBeNull();
    expect(parseAuthLandingType('#type=invite')).toBeNull();
  });

  it('treats an expired or already-used link as an ordinary landing', () => {
    // Supabase sends the failure back in the fragment. There is no token,
    // so a password form could not submit; the sign-in page (with its
    // "email me a link" affordance) is the useful destination.
    expect(parseAuthLandingType(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    )).toBeNull();
  });

  it('ignores an error fragment even if a token is somehow present', () => {
    expect(parseAuthLandingType('#access_token=abc&type=invite&error=access_denied')).toBeNull();
  });
});
