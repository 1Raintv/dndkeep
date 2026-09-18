import {isTokenMovePending} from './pendingTokenMoves';
import { useCallback, useEffect, useRef } from 'react';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import type { UndoableAction } from '../../../lib/hooks/useUndoRedo';

import { commitTokenGroup } from './commitTokenGroup';
import { tokenMoveHistory } from './tokenMoveHistory';
import { tokenFootprintCells } from './shared';
import { useToast } from '../../shared/Toast';

/** v2.699 — DM arrangement moves keep the formation intact and record one undo. */
export function useTokenNudge({ blocked, selectedIds, gridSize, width, height, campaignId, sceneId, record }: {
  blocked: boolean; selectedIds: ReadonlySet<string>; gridSize: number;
  width: number; height: number; campaignId: string; sceneId: string | null;
  record: (action: UndoableAction) => void;
}) {
  const busy = useRef(false);
  const moveRef = useRef<(dx:number,dy:number)=>Promise<void>>(async()=>{});
  const { showToast } = useToast();
  useEffect(() => {
    if (blocked || !selectedIds.size) return;
    let cancelled = false;
    const move = async (dx: number, dy: number) => {
      if (busy.current) return;
      dx *= gridSize; dy *= gridSize;
      const store = useBattleMapStore.getState();
      const tokens = [...selectedIds].map(id => store.tokens[id]);
      if (store.dragging || tokens.some(t => !t || store.remoteDragLocks[t.id])) return;

      if(tokens.some(t=>isTokenMovePending(t.id))){showToast('A selected token is still saving. Please wait.','info');return;}

      // Stop the whole formation at an edge instead of squeezing its members.
      if (tokens.some(t => {
        const cells=tokenFootprintCells(t.size), extent=cells*gridSize;
        const left=cells%2 ? t.x-extent/2 : t.x, top=cells%2 ? t.y-extent/2 : t.y;
        return left+dx<0 || top+dy<0 || left+dx+extent>width || top+dy+extent>height;
      })) { showToast('The selection has reached the edge of the map.', 'info'); return; }
      busy.current=true;
      try {
        const moves=tokens.map(t=>({id:t.id,from:{x:t.x,y:t.y},to:{x:t.x+dx,y:t.y+dy}}));
        const result=await commitTokenGroup(moves,campaignId,()=>!cancelled && useBattleMapStore.getState().currentSceneId===sceneId);
        if(result.failed) showToast('Some tokens could not move. Saved moves can be undone.', 'error');
        if(!cancelled && result.saved.length) record(tokenMoveHistory(result.saved,campaignId));
      } finally { busy.current=false; }
    };
    moveRef.current=move;
    const onKey = (event: KeyboardEvent) => {
      const delta: Record<string, [number, number]> = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
      if (!delta[event.key] || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      event.preventDefault();
      if (!event.repeat) void move(...delta[event.key]);
    };
    window.addEventListener('keydown',onKey);
    return () => { cancelled=true; moveRef.current=async()=>{}; window.removeEventListener('keydown',onKey); };
  }, [blocked,selectedIds,gridSize,width,height,campaignId,sceneId,record,showToast]);
  return useCallback((dx:number,dy:number)=>moveRef.current(dx,dy),[]);
}
