// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 2).
// See that file's header changelog for this code's full history.

import { Container, Text, TextStyle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { useBattleMapStore, type SceneText } from '../../../lib/stores/battleMapStore';
import * as textsApi from '../../../lib/api/sceneTexts';
import { useModal } from '../../shared/Modal';

/**
 * v2.234.0 — TextLayer.
 *
 * Renders text annotations (scene_texts) as Pixi Text instances inside
 * a Container attached to the viewport. Each row in the store becomes
 * one Pixi Text anchored at world (x,y), styled with its color +
 * fontSize, with a black stroke for legibility over busy maps.
 *
 * Authoring (DM only, only when `active`):
 *   - Left-click empty space → window.prompt for text → create + sync.
 *   - Left-click on existing text → window.prompt to edit → update + sync.
 *   - Right-click on existing text → confirm + delete + sync.
 *
 * Outside `active` mode the layer is purely visual — no event handlers
 * fire. window.prompt is intentionally crude for v1; future ship can
 * replace with an inline DOM input.
 *
 * Hit-testing uses Pixi Text bounding boxes in world coords (cheap;
 * texts are small in count).
 */
export function TextLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  active: boolean;
  isDM: boolean;
  currentSceneId: string | null;
  // v2.255.0 — when true (and active is false), left-mouse-drag on an
  // existing text translates it. Right-click still deletes; left-click
  // without a drag still does nothing in select mode (text edits
  // happen via the text-tool flow above).
  selectMode?: boolean;
  // v2.255.0 — undo/redo: caller passes the record fn so create/edit/
  // delete/move all push reverse closures onto the history stack.
  recordUndoable?: (action: import('../../../lib/hooks/useUndoRedo').UndoableAction) => void;
}) {
  const { viewport, canvasEl, active, isDM, currentSceneId, selectMode, recordUndoable } = props;
  const texts = useBattleMapStore(s => s.texts);
  const containerRef = useRef<Container | null>(null);
  // v2.241 — non-blocking modal handles for prompts/confirms.
  const { prompt: promptModal, confirm: confirmModal } = useModal();
  // The pointer handlers below are attached as plain MouseEvent
  // listeners (not React events) so they can't read fresh state from
  // closures. Mirror the modal handles into refs so the handlers
  // always call the latest provider methods.
  const promptRef = useRef(promptModal);
  const confirmRef = useRef(confirmModal);
  useEffect(() => { promptRef.current = promptModal; }, [promptModal]);
  useEffect(() => { confirmRef.current = confirmModal; }, [confirmModal]);
  // v2.255.0 — same ref-mirroring pattern for the new props.
  const recordUndoableRef = useRef(recordUndoable);
  useEffect(() => { recordUndoableRef.current = recordUndoable; }, [recordUndoable]);

  // Mount/unmount the container that holds all Text children.
  useEffect(() => {
    if (!viewport) return;
    const c = new Container();
    containerRef.current = c;
    viewport.addChild(c);
    return () => {
      try { viewport.removeChild(c); } catch { /* viewport gone */ }
      try { c.destroy({ children: true }); } catch { /* destroyed */ }
      containerRef.current = null;
    };
  }, [viewport]);

  // Sync visible Text children whenever store texts change. Wholesale
  // rebuild — text counts are typically small (~tens) and the perf
  // win from diffing isn't worth the complexity yet.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const old = [...c.children];
    c.removeChildren();
    for (const child of old) {
      try { (child as any).destroy?.(); } catch { /* ignore */ }
    }
    for (const t of Object.values(texts)) {
      if (currentSceneId && t.sceneId !== currentSceneId) continue;
      const txt = new Text({
        text: t.text,
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: t.fontSize,
          fontWeight: '700',
          fill: t.color,
          stroke: { color: 0x000000, width: 3 },
          align: 'center',
        }),
      });
      txt.anchor.set(0.5, 0.5);
      txt.x = t.x;
      txt.y = t.y;
      // Stash the SceneText id so right-click hit-testing can locate
      // it without re-querying the store by coordinate.
      (txt as any).__sceneTextId = t.id;
      c.addChild(txt);
    }
  }, [texts, currentSceneId]);

  // Left-click + right-click handlers. Only attach when `active` is
  // true so non-text-mode interactions aren't intercepted.
  useEffect(() => {
    if (!active || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    function findTextAt(world: { x: number; y: number }): SceneText | null {
      const c = containerRef.current;
      if (!c) return null;
      // Iterate top-to-bottom (last drawn on top) for natural picking.
      for (let i = c.children.length - 1; i >= 0; i--) {
        const child = c.children[i];
        const id = (child as any).__sceneTextId as string | undefined;
        if (!id) continue;
        // Use viewport-space bounds via getBounds (Pixi v8 returns
        // a {minX,minY,maxX,maxY} bound box in world coords for
        // children of the viewport).
        const b = child.getBounds();
        if (world.x >= b.minX && world.x <= b.maxX
            && world.y >= b.minY && world.y <= b.maxY) {
          const found = useBattleMapStore.getState().texts[id];
          if (found) return found;
        }
      }
      return null;
    }

    async function onLeftClick(e: MouseEvent) {
      // Only react to primary button; ignore middle/right/etc.
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;

      const existing = findTextAt(w);
      if (existing) {
        // v2.241 — edit existing text via inline modal (was window.prompt).
        const next = await promptRef.current({
          title: 'Edit text',
          defaultValue: existing.text,
          confirmLabel: 'Save',
          // allowEmpty so we can detect empty submission and route to
          // a follow-up delete-confirm instead of silently bailing.
          allowEmpty: true,
        });
        if (next == null) return;
        const trimmed = next.trim();
        if (trimmed === existing.text) return;
        if (trimmed === '') {
          // Empty edit → treat as delete intent.
          const ok = await confirmRef.current({
            title: 'Delete this annotation?',
            message: `"${existing.text}" will be removed from the map.`,
            confirmLabel: 'Delete',
            danger: true,
          });
          if (!ok) return;
          // v2.255.0 — undo: snapshot the full text so undo can re-add it.
          const snapshot = { ...existing };
          useBattleMapStore.getState().removeText(existing.id);
          textsApi.deleteText(existing.id).catch(err =>
            console.error('[TextLayer] deleteText failed', err));
          recordUndoableRef.current?.({
            label: `delete text "${snapshot.text}"`,
            forward: () => {
              useBattleMapStore.getState().removeText(snapshot.id);
              return textsApi.deleteText(snapshot.id).then(() => undefined);
            },
            backward: () => {
              useBattleMapStore.getState().addText(snapshot);
              return textsApi.createText(snapshot).then(() => undefined);
            },
          });
          return;
        }
        // v2.255.0 — undo: capture before/after text for round-trip.
        const beforeText = existing.text;
        const afterText = trimmed;
        useBattleMapStore.getState().updateText(existing.id, { text: trimmed });
        textsApi.updateText(existing.id, { text: trimmed }).catch(err =>
          console.error('[TextLayer] updateText failed', err));
        recordUndoableRef.current?.({
          label: `edit text → "${afterText}"`,
          forward: () => {
            useBattleMapStore.getState().updateText(existing.id, { text: afterText });
            return textsApi.updateText(existing.id, { text: afterText }).then(() => undefined);
          },
          backward: () => {
            useBattleMapStore.getState().updateText(existing.id, { text: beforeText });
            return textsApi.updateText(existing.id, { text: beforeText }).then(() => undefined);
          },
        });
        return;
      }

      // Empty space — create a new annotation. v2.241 — was window.prompt.
      const value = await promptRef.current({
        title: 'New text annotation',
        placeholder: 'Type a label…',
        confirmLabel: 'Add',
      });
      if (value == null) return;
      const trimmed = value.trim();
      if (trimmed === '') return;
      const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (!currentSceneId) return;
      const newText: SceneText = {
        id,
        sceneId: currentSceneId,
        x: w.x,
        y: w.y,
        text: trimmed,
        color: '#ffffff',
        fontSize: 16,
      };
      // Optimistic local insert + fire-and-forget DB write. Realtime
      // echo is idempotent (addText is upsert-by-id).
      useBattleMapStore.getState().addText(newText);
      textsApi.createText(newText).catch(err =>
        console.error('[TextLayer] createText failed', err));
      // v2.255.0 — undo: round-trip via add/delete.
      recordUndoableRef.current?.({
        label: `add text "${trimmed}"`,
        forward: () => {
          useBattleMapStore.getState().addText(newText);
          return textsApi.createText(newText).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().removeText(newText.id);
          return textsApi.deleteText(newText.id).then(() => undefined);
        },
      });
    }

    async function onRightClick(e: MouseEvent) {
      const w = clientToWorld(e);
      if (!w) return;
      const found = findTextAt(w);
      if (!found) return;
      // We're on top of an existing annotation — claim the event so
      // it doesn't bubble up to the wrapper-level token context menu.
      e.stopPropagation();
      e.preventDefault();
      // v2.241 — was window.confirm.
      const ok = await confirmRef.current({
        title: 'Delete text annotation?',
        message: `"${found.text}" will be removed from the map.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      // v2.255.0 — undo: snapshot before delete so we can restore.
      const snapshot = { ...found };
      useBattleMapStore.getState().removeText(found.id);
      textsApi.deleteText(found.id).catch(err =>
        console.error('[TextLayer] deleteText failed', err));
      recordUndoableRef.current?.({
        label: `delete text "${snapshot.text}"`,
        forward: () => {
          useBattleMapStore.getState().removeText(snapshot.id);
          return textsApi.deleteText(snapshot.id).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().addText(snapshot);
          return textsApi.createText(snapshot).then(() => undefined);
        },
      });
    }

    canvasEl.addEventListener('click', onLeftClick);
    // Capture phase so we can intercept before the wrapper's
    // contextmenu preventDefault that's set up at the canvas-wrapper
    // level (which is fine for tokens; here we want our own logic).
    canvasEl.addEventListener('contextmenu', onRightClick, true);
    return () => {
      canvasEl.removeEventListener('click', onLeftClick);
      canvasEl.removeEventListener('contextmenu', onRightClick, true);
    };
  }, [active, canvasEl, viewport, isDM, currentSceneId]);

  // v2.255.0 — Select-mode drag-to-reposition. Separate effect so it
  // attaches independently of the text-tool active flag. Listens for
  // mouse-down on a text in select mode (no tool active), tracks the
  // drag, and commits the new position on mouseup. Records an undo
  // entry only on actual movement (a click that doesn't drag is a
  // no-op so we don't pollute the history).
  useEffect(() => {
    if (!selectMode || active || !canvasEl || !viewport || !isDM || !currentSceneId) return;

    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }

    function findTextAt(world: { x: number; y: number }): SceneText | null {
      const c = containerRef.current;
      if (!c) return null;
      for (let i = c.children.length - 1; i >= 0; i--) {
        const child = c.children[i];
        const id = (child as any).__sceneTextId as string | undefined;
        if (!id) continue;
        const b = child.getBounds();
        if (world.x >= b.minX && world.x <= b.maxX
            && world.y >= b.minY && world.y <= b.maxY) {
          const found = useBattleMapStore.getState().texts[id];
          if (found) return found;
        }
      }
      return null;
    }

    // Drag state. Starts null; populated on mousedown over a text.
    // We snapshot the original x/y for both undo and the cancel-on-
    // tiny-movement guard.
    let drag: {
      id: string;
      startWorld: { x: number; y: number };
      startTextX: number;
      startTextY: number;
    } | null = null;

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;
      const hit = findTextAt(w);
      if (!hit) return;
      drag = {
        id: hit.id,
        startWorld: w,
        startTextX: hit.x,
        startTextY: hit.y,
      };
      // Don't preventDefault here — let viewport panning detection still
      // see the down. We claim move/up only.
    }

    function onMove(e: MouseEvent) {
      if (!drag) return;
      const w = clientToWorld(e);
      if (!w) return;
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      useBattleMapStore.getState().updateText(drag.id, {
        x: drag.startTextX + dx,
        y: drag.startTextY + dy,
      });
    }

    function onUp(e: MouseEvent) {
      if (!drag) return;
      const w = clientToWorld(e);
      if (!w) { drag = null; return; }
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      // Threshold: < 2 world-px is "click, not drag" — bail without
      // committing or recording undo. Pixi click handler above will
      // fire and route to the edit-text flow.
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) { drag = null; return; }
      const finalX = drag.startTextX + dx;
      const finalY = drag.startTextY + dy;
      const id = drag.id;
      const beforeX = drag.startTextX;
      const beforeY = drag.startTextY;
      drag = null;
      // Commit to DB. Local store was already updated mid-drag.
      textsApi.updateText(id, { x: finalX, y: finalY }).catch(err =>
        console.error('[TextLayer] drag commit failed', err));
      recordUndoableRef.current?.({
        label: 'move text',
        forward: () => {
          useBattleMapStore.getState().updateText(id, { x: finalX, y: finalY });
          return textsApi.updateText(id, { x: finalX, y: finalY }).then(() => undefined);
        },
        backward: () => {
          useBattleMapStore.getState().updateText(id, { x: beforeX, y: beforeY });
          return textsApi.updateText(id, { x: beforeX, y: beforeY }).then(() => undefined);
        },
      });
    }

    canvasEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvasEl.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [selectMode, active, canvasEl, viewport, isDM, currentSceneId]);

  return null;
}
