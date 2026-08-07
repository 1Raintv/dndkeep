// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect } from 'react';
import { GRID_EDGE_COLOR, GRID_MINOR_COLOR, GRID_MAJOR_COLOR } from './shared';

export function GridOverlay(props: {
  viewport: Viewport | null;
  widthCells: number;
  heightCells: number;
  gridSizePx: number;
}) {
  const { viewport, widthCells, heightCells, gridSizePx } = props;
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    viewport.addChild(g);

    const WW = widthCells * gridSizePx;
    const WH = heightCells * gridSizePx;

    g.setStrokeStyle({ color: GRID_EDGE_COLOR, width: 2, alpha: 0.8 });
    g.rect(0, 0, WW, WH);
    g.stroke();

    g.setStrokeStyle({ color: GRID_MINOR_COLOR, width: 1, alpha: 0.6 });
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

    g.setStrokeStyle({ color: GRID_MAJOR_COLOR, width: 1.5, alpha: 0.9 });
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

    return () => {
      if (viewport && !viewport.destroyed) viewport.removeChild(g);
      g.destroy();
    };
  }, [viewport, widthCells, heightCells, gridSizePx]);

  return null;
}
