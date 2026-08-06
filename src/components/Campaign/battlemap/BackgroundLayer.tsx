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
  // v2.637 leak fix (audit 5.2) — URL of the texture currently held in
  // Pixi's global Assets cache by THIS layer. Scene backgrounds are the
  // largest textures in the app (full-map images, often multi-MB on the
  // GPU); before this, every scene switch left the previous scene's
  // background cached forever. Backgrounds are per-scene (not shared
  // between sprites like token portraits), so unloading the old URL when
  // the path changes is safe; revisiting a scene re-fetches through the
  // browser's HTTP cache.
  const loadedUrlRef = useRef<string | null>(null);

  function unloadPrevious() {
    const prev = loadedUrlRef.current;
    if (prev) {
      loadedUrlRef.current = null;
      Assets.unload(prev).catch(() => { /* already gone — fine */ });
    }
  }

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
    unloadPrevious();

    if (!backgroundPath) return; // nothing to render

    const url = assetsApi.getSceneBackgroundUrl(backgroundPath);
    if (!url) return;

    Assets.load<Texture>(url).then(texture => {
      if (loadGenRef.current !== thisGen) {
        // A newer load superseded this one — release the stale texture
        // unless the newer generation wants the SAME url. v2.648 fix:
        // comparing against loadedUrlRef alone was not enough. On a
        // scene switch the effect can run twice back-to-back (path and
        // world dims land in separate renders), issuing two loads for
        // the same url. Load #1 resolved stale BEFORE load #2 recorded
        // loadedUrlRef, unloaded the shared cache entry, and load #2
        // then received an already-destroyed texture — Pixi's batcher
        // crashed on source=null every frame and the map went
        // permanently black until a reload.
        const currentUrl = currentPathRef.current
          ? assetsApi.getSceneBackgroundUrl(currentPathRef.current)
          : null;
        if (url !== currentUrl && loadedUrlRef.current !== url) {
          Assets.unload(url).catch(() => {});
        }
        return;
      }
      if (!viewport || viewport.destroyed) return;
      // Defense-in-depth for any remaining unload/load interleaving:
      // never mount a dead texture (it poisons the render loop — see
      // above). Reload once; Assets re-fetches through the HTTP cache.
      if (texture.destroyed || !texture.source) {
        Assets.load<Texture>(url).then(fresh => {
          if (loadGenRef.current !== thisGen || fresh.destroyed || !fresh.source) return;
          if (!viewport || viewport.destroyed) return;
          loadedUrlRef.current = url;
          const s = new Sprite(fresh);
          s.width = worldWidth;
          s.height = worldHeight;
          viewport.addChildAt(s, 0);
          spriteRef.current = s;
        }).catch(() => {});
        return;
      }
      loadedUrlRef.current = url;

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
      // v2.637 — release the background texture from the Assets cache
      // when the layer unmounts (leaving the map tab / closing the scene).
      const prev = loadedUrlRef.current;
      if (prev) {
        loadedUrlRef.current = null;
        Assets.unload(prev).catch(() => {});
      }
    };
  }, []);

  return null;
}
