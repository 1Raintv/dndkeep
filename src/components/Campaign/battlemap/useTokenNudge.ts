import { useEffect, useRef } from 'react';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import type { UndoableAction } from '../../../lib/hooks/useUndoRedo';
import type { TokenMove } from '../../../lib/map/tokenMoveHistory';
import * as tokensApi from '../../../lib/api/tokensApiRouter';
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
  const { showToast } = useToast();
  useEffect(() => {
    if (blocked || !selectedIds.size) return;
    let cancelled = false;
    const onKey = async (event: KeyboardEvent) => {
      const delta: Record<string, [number, number]> = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
      if (!delta[event.key] || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      event.preventDefault();
      if (busy.current || event.repeat) return;
      const store = useBattleMapStore.getState();
      const tokens = [...selectedIds].map(id => store.tokens[id]);
      if (store.dragging || tokens.some(t => !t || store.remoteDragLocks[t.id])) return;
      const [dx,dy] = delta[event.key].map(n => n*gridSize);
      // Stop the whole formation at an edge instead of squeezing its members.
      if (tokens.some(t => {
        const cells=tokenFootprintCells(t.size), extent=cells*gridSize;
        const left=cells%2 ? t.x-extent/2 : t.x, top=cells%2 ? t.y-extent/2 : t.y;
        return left+dx<0 || top+dy<0 || left+dx+extent>width || top+dy+extent>height;
      })) { showToast('The selection has reached the edge of the map.', 'info'); return; }
      busy.current=true;
      const saved: TokenMove[]=[];
      try {
        for (const t of tokens) {
          if (cancelled) break;
          const current=useBattleMapStore.getState();
          if (current.currentSceneId!==sceneId || current.dragging || current.remoteDragLocks[t.id]) break;
          if (current.tokens[t.id]?.x!==t.x || current.tokens[t.id]?.y!==t.y) throw new Error('Token changed during group move');
          const result=await tokensApi.updateTokenPos(t.id,t.x+dx,t.y+dy,{campaignId});
          if (!result.ok) throw new Error('Move not saved');
          saved.push({id:t.id,from:{x:t.x,y:t.y},to:{x:t.x+dx,y:t.y+dy}});
          if (!cancelled) current.updateTokenPosition(t.id,t.x+dx,t.y+dy);
        }
      } catch {
        showToast('Some tokens could not move. Saved moves can be undone.', 'error');
      } finally {
        if (!cancelled && saved.length) record(tokenMoveHistory(saved,campaignId));
        busy.current=false;
      }
    };
    window.addEventListener('keydown',onKey);
    return () => { cancelled=true; window.removeEventListener('keydown',onKey); };
  }, [blocked,selectedIds,gridSize,width,height,campaignId,sceneId,record,showToast]);
}
