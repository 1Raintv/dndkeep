// v2.663.0 — How far a creature can see, in feet.
//
// Split out of VisionLayer, which hardcoded `12 * gridSizePx` — 60 ft
// for everyone, since v2.224. That made darkvision decorative: a Dwarf
// and a Human rendered identically in a pitch-dark room even though the
// character sheet has shown the Dwarf's 60 ft since the creator shipped.
//
// Pure by construction (src/rules/ imports nothing) so the interesting
// cases are unit-testable without a canvas — see vision.test.ts.

/** Scene-level ambient light, mirroring `scenes.ambient_light`. */
export type AmbientLight = 'bright' | 'dim' | 'dark';

/**
 * Radius a creature can see, in FEET. `null` means unlimited — sight is
 * bounded by walls alone, not by range.
 *
 * The 2024 rules only ever gate sight on light:
 *   Bright light  — see normally.
 *   Dim light     — lightly obscured: you still SEE, you just take
 *                   disadvantage on Perception checks that rely on
 *                   sight. Disadvantage is not a distance limit, so dim
 *                   is unlimited here too; the translucent fog the map
 *                   draws over dim scenes carries the "gloomy" read.
 *   Darkness      — heavily obscured: effectively blinded. You see
 *                   nothing except what your own darkvision or your own
 *                   light source reaches.
 *
 * Hence only 'dark' produces a finite radius, and there it is the better
 * of the two things a creature brings with it.
 *
 * `carriedLightFt` is the total radius a creature's own light reaches
 * (a torch's 20 ft bright + 20 ft dim = 40). Kept as one number rather
 * than a bright/dim pair because the fog is binary — a cell is revealed
 * or it is not — so splitting it would model a distinction the renderer
 * cannot draw.
 *
 * Returning 0 (blind) is deliberate and correct: a Human with no torch
 * in a dark room genuinely cannot see. It is also why light sources had
 * to land alongside this — see `carriedLightFt` on the token.
 */
export function sightRadiusFt(
  ambient: AmbientLight,
  darkvisionFt: number,
  carriedLightFt: number,
): number | null {
  if (ambient !== 'dark') return null;          // bright + dim: unlimited
  return Math.max(0, darkvisionFt || 0, carriedLightFt || 0);
}

/**
 * Same answer in world pixels, ready for the visibility polygon.
 * `null` → unlimited, which callers clamp to the map diagonal.
 *
 * 5 ft per grid square is the RAW constant, NOT `scenes.grid_size`
 * (which is a pixel measurement). Mixing those up is the bug
 * `battleMapGeometry`'s FEET_PER_SQUARE comment warns about.
 */
export const FEET_PER_SQUARE = 5;

export function sightRadiusPx(
  ambient: AmbientLight,
  darkvisionFt: number,
  carriedLightFt: number,
  gridSizePx: number,
): number | null {
  const ft = sightRadiusFt(ambient, darkvisionFt, carriedLightFt);
  if (ft === null) return null;
  return (ft / FEET_PER_SQUARE) * gridSizePx;
}
