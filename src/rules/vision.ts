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

/** A thing that emits light. Any token with `lightRadiusFt > 0`. */
export interface LightSource {
  id: string;
  /** World pixels. */
  x: number;
  y: number;
  radiusFt: number;
}

/** A sight-blocking wall segment, in world pixels. */
export interface SightBlocker {
  x1: number; y1: number; x2: number; y2: number;
}

/** Standard segment-intersection test, duplicated from cover.ts's
 *  private helper rather than exported across modules — four lines, and
 *  the alternative is a rules module depending on the cover model for a
 *  primitive that has nothing to do with cover. */
function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (d === 0) return false;                       // parallel
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * v2.665.0 — Which light sources should illuminate for these viewers.
 *
 * A lamp does not reveal a room to someone who cannot see the lamp:
 * without this gate, placing a brazier anywhere would light that area
 * for the whole party permanently, wherever they were standing. So a
 * source counts only when at least one viewer has an unobstructed line
 * to it.
 *
 * APPROXIMATION, stated plainly: this tests line of sight to the light's
 * CENTRE POINT. Strictly, a viewer should also see the parts of a lit
 * region that spill into their view even when the lamp itself is hidden
 * — light around a corner. Doing that properly means intersecting two
 * visibility polygons per (viewer, light) pair, which is a real
 * computational-geometry job and far more than this is worth today. The
 * error is conservative in the direction that matters: it hides light
 * that should be visible, never reveals a room that should be dark.
 */
export function visibleLightSources(
  viewers: ReadonlyArray<{ x: number; y: number }>,
  lights: readonly LightSource[],
  blockers: readonly SightBlocker[],
): LightSource[] {
  if (viewers.length === 0) return [];
  return lights.filter(light => {
    if (!(light.radiusFt > 0)) return false;
    return viewers.some(v =>
      !blockers.some(b =>
        segmentsCross(v.x, v.y, light.x, light.y, b.x1, b.y1, b.x2, b.y2)));
  });
}
