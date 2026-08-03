// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.

import { Assets, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import * as assetsApi from '../../../lib/api/battleMapAssets';

/**
 * v2.217 — Scene background image layer.
 *
 * When the scene has a backgroundStoragePath, we load the texture and
 * render a Sprite that fills the world (0,0) → (worldWidth, worldHeight).
 * The sprite is the lowest child of the viewport (below grid + tokens),
 * so grid lines and tokens always render on top.
 *
 * Design decisions:
 *  - Stretch-to-world rather than preserving aspect. Rationale: the
 *    DM knows their image's aspect and is expected to configure scene
 *    dimensions to match. v2.218 can add aspect-preserving helpers.
 *  - Texture loads are async via Pixi Assets; we show nothing during
 *    load (grid renders on transparent, which is fine on the dark bg).
 *  - Like TokenLayer's portrait loader, a loadGen counter guards
 *    against stale resolutions when the path changes rapidly.
 *  - On path=null (removed): destroy sprite, no draw.
 */
export function BackgroundLayer(props: {
  viewport: Viewport | null;
  backgroundPath: string | null;
  worldWidth: number;
  worldHeight: number;
}) {
  const { viewport, backgroundPath, worldWidth, worldHeight } = props;
  const spriteRef = useRef<Sprite | null>(null);
  const loadGenRef = useRef(0);
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewport) return;

    // If path matches what we already have loaded and world dims
    // changed, just resize in place — avoid a reload.
    if (backgroundPath === currentPathRef.current && spriteRef.current && !spriteRef.current.destroyed) {
      spriteRef.current.width = worldWidth;
      spriteRef.current.height = worldHeight;
      return;
    }

    // Path changed (or first render) — tear down the old sprite.
    loadGenRef.current += 1;
    const thisGen = loadGenRef.current;
    currentPathRef.current = backgroundPath;

    if (spriteRef.current) {
      if (!spriteRef.current.destroyed) {
        viewport.removeChild(spriteRef.current);
        spriteRef.current.destroy();
      }
      spriteRef.current = null;
    }

    if (!backgroundPath) return; // nothing to render

    const url = assetsApi.getSceneBackgroundUrl(backgroundPath);
    if (!url) return;

    Assets.load<Texture>(url).then(texture => {
      if (loadGenRef.current !== thisGen) return;
      if (!viewport || viewport.destroyed) return;

      const sprite = new Sprite(texture);
      sprite.x = 0;
      sprite.y = 0;
      sprite.width = worldWidth;
      sprite.height = worldHeight;
      // v2.217: put background at the LOWEST z-index so grid + tokens
      // render above it. viewport's addChildAt(sprite, 0) inserts at
      // the front of the children array.
      viewport.addChildAt(sprite, 0);
      spriteRef.current = sprite;
    }).catch(err => {
      console.error('[BackgroundLayer] texture load failed', backgroundPath, err);
    });
  }, [viewport, backgroundPath, worldWidth, worldHeight]);

  // Cleanup on unmount or viewport change.
  useEffect(() => {
    return () => {
      if (spriteRef.current && !spriteRef.current.destroyed) {
        spriteRef.current.destroy();
        spriteRef.current = null;
      }
    };
  }, []);

  return null;
}
