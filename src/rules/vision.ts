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
 * v2.666.0 — the two radii a light throws, in FEET.
 *
 * `brightFt` is fully lit; `dimFt` is the OUTER edge of the dim band,
 * measured from the same centre (not an additional distance). A torch
 * is `{ brightFt: 20, dimFt: 40 }`.
 */
export interface LightBands {
  brightFt: number;
  dimFt: number;
}

/**
 * v2.666.0 — split a light's total radius into its bright and dim bands.
 *
 * Every light source the DM can pick sheds bright light to R and dim for
 * a further R — candle 5+5, torch 20+20, hooded lantern 30+30, the
 * Daylight spell 60+60 — so the bright band is exactly half the total
 * the token stores. That is why v2.663 could get away with a single
 * `light_radius_ft` column and why bands need no migration to arrive:
 * the information was always there, the renderer just could not draw it.
 *
 * If a light that breaks the 1:1 ratio is ever added (a bullseye lantern
 * is a cone, not a disc, and would break more than this), it needs a
 * second column and this becomes a lookup rather than a halving.
 */
export function lightBandsFt(totalFt: number): LightBands {
  const total = Math.max(0, totalFt || 0);
  return { brightFt: total / 2, dimFt: total };
}

/**
 * How far a creature sees at each tier, in FEET. `null` means unlimited
 * at the BRIGHT tier — sight is bounded by walls alone, not by range.
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
 * Hence only 'dark' produces finite bands.
 *
 * v2.666.0 — was `sightRadiusFt`, one flat number, because the fog was
 * binary and a bright/dim pair would have modelled a distinction the
 * renderer could not draw. It can now, so the two things a creature
 * brings into a dark room land in the tier each actually grants:
 *
 *   - Its own light: bright band bright, dim band dim (`lightBandsFt`).
 *   - DARKVISION IS DIM, NOT BRIGHT. RAW: within the radius you treat
 *     darkness as dim light. A Dwarf in an unlit room can navigate and
 *     act, but is lightly obscured the whole way — which is why the
 *     Dwarf's 60 ft now renders murky rather than as clear as daylight.
 *     That is a fidelity fix, not a nerf: the old flat disc claimed a
 *     Dwarf saw as well in pitch dark as under a torch.
 *
 * Returning `{ 0, 0 }` (blind) is deliberate and correct: a Human with
 * no torch in a dark room genuinely cannot see. It is also why light
 * sources had to land alongside v2.663 in the first place.
 */
export function sightBandsFt(
  ambient: AmbientLight,
  darkvisionFt: number,
  carriedLightFt: number,
): LightBands | null {
  if (ambient !== 'dark') return null;          // bright + dim: unlimited
  const own = lightBandsFt(carriedLightFt);
  const darkvision = Math.max(0, darkvisionFt || 0);
  // Darkvision and torchlight overlap; they never sum. A Dwarf holding
  // a torch sees 60 ft, not 100.
  return {
    brightFt: own.brightFt,
    dimFt: Math.max(darkvision, own.dimFt),
  };
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

/** Feet → world pixels at this grid scale. */
export function feetToPx(ft: number, gridSizePx: number): number {
  return (ft / FEET_PER_SQUARE) * gridSizePx;
}

export function sightBandsPx(
  ambient: AmbientLight,
  darkvisionFt: number,
  carriedLightFt: number,
  gridSizePx: number,
): { brightPx: number; dimPx: number } | null {
  const bands = sightBandsFt(ambient, darkvisionFt, carriedLightFt);
  if (bands === null) return null;
  return {
    brightPx: feetToPx(bands.brightFt, gridSizePx),
    dimPx: feetToPx(bands.dimFt, gridSizePx),
  };
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
// Generic over the light type so callers keep whatever else they hang on
// a source — v2.668's `color`, for one. Returning bare `LightSource[]`
// would force a cast at the call site to read fields this function never
// touched and never dropped.
export function visibleLightSources<T extends LightSource>(
  viewers: ReadonlyArray<{ x: number; y: number }>,
  lights: readonly T[],
  blockers: readonly SightBlocker[],
): T[] {
  if (viewers.length === 0) return [];
  return lights.filter(light => {
    if (!(light.radiusFt > 0)) return false;
    return viewers.some(v =>
      !blockers.some(b =>
        segmentsCross(v.x, v.y, light.x, light.y, b.x1, b.y1, b.x2, b.y2)));
  });
}
