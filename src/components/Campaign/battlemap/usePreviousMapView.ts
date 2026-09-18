import {useEffect,useState} from 'react';
import type {Viewport} from 'pixi-viewport';

/** v2.726 — one local return point for deliberate Fit/Find jumps. Never
 * replay a camera from another scene, or put camera actions in token undo. */
export function usePreviousMapView(viewport:Viewport|null,sceneId:string|null) {
  const [saved,setSaved]=useState<{viewport:Viewport;sceneId:string|null;x:number;y:number;zoom:number}|null>(null);
  useEffect(()=>setSaved(null),[viewport,sceneId]);
  const canReturn=!!saved && saved.viewport===viewport && saved.sceneId===sceneId;
  return {
    canReturn,
    remember:(destination?:{x:number;y:number;zoom:number})=>{
      // v2.727 — repeated Fit/Find must not replace the return point with
      // the view we're already in. Ignore only floating-point camera noise.
      if(viewport && destination && Math.abs(viewport.center.x-destination.x)<1e-6
        && Math.abs(viewport.center.y-destination.y)<1e-6
        && Math.abs(viewport.scale.x-destination.zoom)<1e-6)return;
      if(viewport)setSaved({viewport,sceneId,x:viewport.center.x,y:viewport.center.y,zoom:viewport.scale.x});
    },
    restore:()=>{
      if(!viewport || !saved || !canReturn)return null;
      viewport.plugins.get('decelerate')?.reset();
      // A previous Fit may have allowed a zoom below the usual 25% floor.
      viewport.clampZoom({minScale:Math.min(.25,saved.zoom),maxScale:4});
      viewport.setZoom(saved.zoom,true);
      viewport.moveCenter(saved.x,saved.y);
      setSaved(null);
      return viewport.scale.x;
    },
  };
}
