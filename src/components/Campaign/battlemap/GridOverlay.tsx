// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import {useGridAppearance} from '../../../lib/stores/gridAppearanceStore';
import {gridColors} from '../../../lib/map/gridAppearance';

export function GridOverlay(props: {
  viewport: Viewport | null;
  widthCells: number;
  heightCells: number;
  gridSizePx: number;
}) {
  const { viewport, widthCells, heightCells, gridSizePx } = props;
  const {opacity,palette,majorLines}=useGridAppearance();
  const graphic=useRef<Graphics|null>(null);
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    g.label='map-grid';g.eventMode='none';graphic.current=g;
    viewport.addChild(g);
    return ()=>{if(!viewport.destroyed)viewport.removeChild(g);g.destroy();graphic.current=null;};
  },[viewport]);
  // v2.708 — retain the same layer while restyling; re-adding would put it above tokens.
  // v2.746 — both restyle effects can run after the mount effect's cleanup
  // destroyed the Graphics (scene switch / viewport remount): g.clear() on a
  // destroyed Graphics threw an uncaught TypeError every map session.
  useEffect(()=>{const g=graphic.current;if(!g||g.destroyed)return;g.alpha=opacity;},[viewport,opacity]);
  useEffect(()=>{
    const g=graphic.current;if(!g||g.destroyed)return;g.clear();
    const colors=gridColors(palette);

    const WW = widthCells * gridSizePx;
    const WH = heightCells * gridSizePx;

    g.setStrokeStyle({ color: colors.edge, width: 2, alpha: 0.8 });
    g.rect(0, 0, WW, WH);
    g.stroke();

    g.setStrokeStyle({ color: colors.minor, width: 1, alpha: 0.6 });
    for (let x = 0; x <= widthCells; x++) {
      const px = x * gridSizePx;
      g.moveTo(px, 0);
      g.lineTo(px, WH);
    }
    for (let y = 0; y <= heightCells; y++) {
      const py = y * gridSizePx;
      g.moveTo(0, py);
      g.lineTo(WW, py);
    }
    g.stroke();

    if(!majorLines)return;
    g.setStrokeStyle({ color: colors.major, width: 1.5, alpha: 0.9 });
    for (let x = 0; x <= widthCells; x += 5) {
      const px = x * gridSizePx;
      g.moveTo(px, 0);
      g.lineTo(px, WH);
    }
    for (let y = 0; y <= heightCells; y += 5) {
      const py = y * gridSizePx;
      g.moveTo(0, py);
      g.lineTo(WW, py);
    }
    g.stroke();

  }, [viewport, widthCells, heightCells, gridSizePx, palette, majorLines]);

  return null;
}
