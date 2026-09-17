// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 1).
// See that file's header changelog for this code's full history.

import { useApplication } from '@pixi/react';
import { Viewport } from 'pixi-viewport';
import { useEffect, useState, type ReactNode } from 'react';
import { mapResolution } from './mapResolution';

export function ViewportHost(props: {
  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
  onViewportChange?: (viewport: Viewport | null) => void;
  children: (viewport: Viewport | null) => ReactNode;
}) {
  const { screenWidth, screenHeight, worldWidth, worldHeight, children, onViewportChange } = props;
  const appState = useApplication();
  const [viewport, setViewport] = useState<Viewport | null>(null);

  // v2.225 fix — Pixi v8's Application init is async. useApplication
  // returns an ApplicationState object whose `isInitialised` flag goes
  // true once the renderer is ready. Earlier versions of this effect
  // omitted `appState` from the dep array, which meant the effect ran
  // ONCE at mount with `app.renderer` still undefined → bailed early →
  // never re-fired → viewport never got created → stage stayed empty.
  // Symptom: black canvas, nothing draws. Including appState (and
  // gating on isInitialised) makes the effect re-fire as soon as Pixi
  // is ready.
  const pixiApp = (appState as any)?.app ?? appState;
  const isReady = !!(appState as any)?.isInitialised || !!pixiApp?.renderer;

  useEffect(() => {
    if (!pixiApp || !pixiApp.renderer || !isReady) return;

    // v2.648 — dev-only escape hatch for debugging the live scene graph
    // from the console / E2E scripts (also what the Pixi devtools
    // extension looks for). Stripped from production builds.
    if (import.meta.env.DEV) (globalThis as any).__PIXI_APP__ = pixiApp;

    const vp = new Viewport({
      screenWidth,
      screenHeight,
      worldWidth,
      worldHeight,
      events: pixiApp.renderer.events,
      passiveWheel: false,
    });
    vp
      .drag({ mouseButtons: 'middle-right' })
      .pinch()
      .wheel({ smooth: 8 })
      .decelerate({ friction: 0.92 })
      .clampZoom({ minScale: Math.min(0.25, screenWidth / worldWidth * 0.8, screenHeight / worldHeight * 0.8), maxScale: 4 });
    vp.moveCenter(worldWidth / 2, worldHeight / 2);
    // v2.336.0 — P1+P2 fix: default zoom shows the map with breathing
    // room on all sides instead of filling the canvas edge-to-edge.
    //
    // Old behavior: fitScale = the largest zoom that lets the world
    // fit inside the screen. We applied it directly when world > screen.
    // Result: the world filled the canvas edge-to-edge horizontally,
    // and the left-edge tools palette (top:60 left:12) sat ON TOP of
    // map content — the user reported the tools menu felt "lost" and
    // tokens at the map's left edge were obscured.
    //
    // New behavior: 0.80 × fitScale, capped at 1.0 (we never zoom IN
    // past native by default — only out). That gives the viewer:
    //   - ~20% margin around the world on the dominant axis
    //   - The tools palette + zoom badges + scene-name badge all sit
    //     in negative space around the map, not on it
    //   - Room to pan / zoom in while still seeing context near the
    //     map's edges
    //
    // Same math regardless of world or screen size — no special-cases
    // for tiny scenes or huge ones.
    const fitScale = Math.min(screenWidth / worldWidth, screenHeight / worldHeight);
    const initialScale = Math.min(fitScale * 0.80, 1.0);
    vp.setZoom(initialScale, true);

    pixiApp.stage.addChild(vp);
    setViewport(vp);

    return () => {
      if (!vp.destroyed) {
        if (pixiApp.stage && !pixiApp.stage.destroyed) {
          pixiApp.stage.removeChild(vp);
        }
        vp.destroy({ children: true });
      }
      setViewport(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldWidth, worldHeight, pixiApp, isReady]);

  // v2.697 — resizing/fullscreen must not destroy tokens or reset the camera.
  // Free tabletop panning also keeps small maps movable below fit zoom.
  useEffect(() => {
    if (!viewport || viewport.destroyed) return;
    const center = { x: viewport.center.x, y: viewport.center.y };
    // v2.702 — backing pixels follow display density; CSS size and pointer
    // coordinates stay unchanged. Also refresh when moving between monitors.
    const resizeRenderer=()=>{
      pixiApp.renderer.view.autoDensity=true;
      pixiApp.renderer.resize(screenWidth,screenHeight,mapResolution(screenWidth,screenHeight,window.devicePixelRatio));
    };
    resizeRenderer();
    window.addEventListener('resize',resizeRenderer);
    viewport.resize(screenWidth, screenHeight, worldWidth, worldHeight);
    viewport.clampZoom({ minScale: Math.min(0.25, screenWidth / worldWidth * 0.8, screenHeight / worldHeight * 0.8), maxScale: 4 });
    viewport.moveCenter(center.x, center.y);
    return ()=>window.removeEventListener('resize',resizeRenderer);
  }, [viewport, screenWidth, screenHeight, worldWidth, worldHeight, pixiApp]);

  useEffect(() => {
    onViewportChange?.(viewport);
    return () => onViewportChange?.(null);
  }, [viewport, onViewportChange]);

  return <>{children(viewport)}</>;
}
