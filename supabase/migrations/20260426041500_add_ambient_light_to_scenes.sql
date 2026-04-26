-- v2.274.0 — Phase Q.1 pt 32: scene-level lighting / day-night.
--
-- Adds an ambient_light enum-as-text column to the scenes table. Three
-- values:
--   - 'bright': no fog at all (daylight, outdoor scenes). Vision
--     polygons are still computed but the VisionLayer skips rendering
--     entirely.
--   - 'dim':    fog rendered at ~0.55 alpha (dusk, twilight). Vision
--     polygons still cut transparent holes through the dim layer so
--     PCs see clearly within their range.
--   - 'dark':   fog rendered at 1.0 alpha (current behavior — dungeons,
--     night). Players see only inside their vision polygons.
--
-- Default 'dark' for backward compat — existing scenes that were set
-- up assuming the always-on fog behavior keep that exact look. The DM
-- toggles bright/dim/dark from the in-app toolbar at any time.
--
-- CHECK constraint enforces the three legal values; the v2.274 client
-- code is the only writer and only sends these three. A future ship
-- adding a new mode (e.g. 'bright_dim_dark' for graduated falloff)
-- will need to update both the constraint and the client code.

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS ambient_light text NOT NULL DEFAULT 'dark'
  CHECK (ambient_light IN ('bright', 'dim', 'dark'));

COMMENT ON COLUMN public.scenes.ambient_light IS
  'Scene ambient lighting: bright (no fog), dim (translucent fog), dark (opaque fog — original behavior). Drives VisionLayer rendering for players. Added in v2.274.';
