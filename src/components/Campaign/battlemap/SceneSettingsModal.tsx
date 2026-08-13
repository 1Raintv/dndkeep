// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 3).
// See that file's header changelog for this code's full history.

import { Assets, Texture } from 'pixi.js';
import { useCallback, useEffect, useState } from 'react';
import * as scenesApi from '../../../lib/api/scenes';
import * as assetsApi from '../../../lib/api/battleMapAssets';
import { useModal } from '../../shared/Modal';
import { useToast } from '../../shared/Toast';

/**
 * v2.219 — Scene settings modal.
 *
 * Lets the DM edit scene name, grid dimensions, and published state,
 * plus delete the scene. Dimensions accept arbitrary positive integers;
 * DB CHECK constraints (from v2.208 migration) enforce > 0.
 *
 * "Fit to map image" helper: when a background is uploaded, we can read
 * the natural pixel dimensions of the cached Texture (Pixi has already
 * loaded it for BackgroundLayer) via Assets.get(url). From there we
 * derive cell counts that match the image aspect at the CURRENT grid_size_px.
 *   widthCells  = round(imageWidth  / gridSizePx)
 *   heightCells = round(imageHeight / gridSizePx)
 * This assumes the DM wants one image pixel ≈ one visual pixel at 1x
 * zoom, which is the most common case. For images much larger or
 * smaller than the cell count, the DM can adjust gridSizePx first.
 *
 * Commit flow: form fields update local modal state on each change.
 * "Save" applies changes via scenesApi.updateScene + optimistic local
 * updates to both `scenes` array and `currentScene`. Realtime (v2.214)
 * echoes the changes to other clients.
 *
 * "Delete" uses an inline confirm modal as of v2.241 (replaced
 * window.confirm).
 */
export function SceneSettingsModal(props: {
  scene: scenesApi.Scene;
  onClose: () => void;
  onScenePatched: (patch: Partial<scenesApi.Scene>) => void;
  onSceneDeleted: (id: string) => void;
}) {
  const { scene, onClose, onScenePatched, onSceneDeleted } = props;
  const { showToast } = useToast();
  const { confirm: confirmModal } = useModal();
  const [name, setName] = useState(scene.name);
  const [gridSizePx, setGridSizePx] = useState(scene.gridSizePx);
  const [widthCells, setWidthCells] = useState(scene.widthCells);
  const [heightCells, setHeightCells] = useState(scene.heightCells);
  const [isPublished, setIsPublished] = useState(scene.isPublished);
  // v2.664.0 — fog mode. Lives here rather than the toolbar because
  // it is a property OF the scene, not a tool you toggle mid-turn.
  const [fogMode, setFogMode] = useState(scene.fogMode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Re-sync local state when the scene prop changes (e.g. Realtime
  // update arrived from another client while modal was open). Happens
  // rarely but prevents "save stomps remote update" silently.
  useEffect(() => {
    setName(scene.name);
    setGridSizePx(scene.gridSizePx);
    setWidthCells(scene.widthCells);
    setHeightCells(scene.heightCells);
    setIsPublished(scene.isPublished);
    setFogMode(scene.fogMode);
  }, [scene.id, scene.updatedAt]);

  // Escape closes the modal.
  useEffect(() => {
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  // "Fit to map image" — inspects the cached texture for the scene's
  // background and sets widthCells/heightCells to match the image
  // aspect at current gridSizePx. Only offered when a background path
  // exists; the button is disabled otherwise.
  const fitToImage = useCallback(async () => {
    if (!scene.backgroundStoragePath) return;
    const url = assetsApi.getSceneBackgroundUrl(scene.backgroundStoragePath);
    if (!url) return;
    try {
      // Assets.get returns the cached texture if already loaded; .load
      // fetches it otherwise. Either way, we get dimensions.
      let texture = Assets.get<Texture>(url);
      if (!texture) {
        texture = await Assets.load<Texture>(url);
      }
      if (!texture?.width || !texture?.height) return;
      const nextW = Math.max(1, Math.round(texture.width / gridSizePx));
      const nextH = Math.max(1, Math.round(texture.height / gridSizePx));
      setWidthCells(nextW);
      setHeightCells(nextH);
    } catch (err) {
      console.error('[SceneSettings] fit-to-image failed', err);
    }
  }, [scene.backgroundStoragePath, gridSizePx]);

  async function save() {
    // Minimal validation — positive integers only. DB CHECK enforces
    // server-side but we give fast feedback here.
    if (!Number.isFinite(gridSizePx) || gridSizePx < 10 || gridSizePx > 500) {
      showToast('Grid size must be between 10 and 500 pixels.', 'warn');
      return;
    }
    if (!Number.isFinite(widthCells) || widthCells < 1 || widthCells > 200) {
      showToast('Width must be between 1 and 200 cells.', 'warn');
      return;
    }
    if (!Number.isFinite(heightCells) || heightCells < 1 || heightCells > 200) {
      showToast('Height must be between 1 and 200 cells.', 'warn');
      return;
    }
    setSaving(true);
    try {
      const patch: Partial<scenesApi.Scene> = {
        name: name.trim() || scene.name,
        gridSizePx,
        widthCells,
        heightCells,
        isPublished,
        fogMode,
      };
      // Optimistic update first.
      onScenePatched(patch);
      const ok = await scenesApi.updateScene(scene.id, patch);
      if (!ok) {
        showToast('Failed to save. Check console for details.', 'error');
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    // v2.241 — was window.confirm.
    const ok = await confirmModal({
      title: `Delete scene "${scene.name}"?`,
      message: 'This removes the scene and all tokens in it. This cannot be undone.',
      confirmLabel: 'Delete scene',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await scenesApi.deleteScene(scene.id);
      if (!result) {
        showToast('Failed to delete. Check console for details.', 'error');
        return;
      }
      onSceneDeleted(scene.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
  };

  const modalStyle: React.CSSProperties = {
    minWidth: 380,
    maxWidth: 480,
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-lg, 12px)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    fontFamily: 'var(--ff-body)',
    color: 'var(--t-1)',
    padding: 20,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--t-3)',
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--c-raised)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-sm, 4px)',
    color: 'var(--t-1)',
    fontFamily: 'var(--ff-body)',
    fontSize: 13,
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={backdropStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={stop}>
        <div style={{
          fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
          marginBottom: 16, color: 'var(--t-1)',
          textTransform: 'uppercase' as const,
        }}>
          Scene Settings
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            maxLength={80}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Grid (px)</label>
            <input
              type="number"
              value={gridSizePx}
              onChange={(e) => setGridSizePx(parseInt(e.target.value) || 0)}
              style={inputStyle}
              min={10}
              max={500}
            />
          </div>
          <div>
            <label style={labelStyle}>Width (cells)</label>
            <input
              type="number"
              value={widthCells}
              onChange={(e) => setWidthCells(parseInt(e.target.value) || 0)}
              style={inputStyle}
              min={1}
              max={200}
            />
          </div>
          <div>
            <label style={labelStyle}>Height (cells)</label>
            <input
              type="number"
              value={heightCells}
              onChange={(e) => setHeightCells(parseInt(e.target.value) || 0)}
              style={inputStyle}
              min={1}
              max={200}
            />
          </div>
        </div>

        {scene.backgroundStoragePath && (
          <button
            onClick={fitToImage}
            title="Auto-size the grid to match the uploaded map image's aspect at the current grid size"
            style={{
              padding: '5px 10px',
              background: 'rgba(96,165,250,0.15)',
              border: '1px solid rgba(96,165,250,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#60a5fa',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            Fit to map image
          </button>
        )}

        {/* v2.664.0 — fog mode. The two modes answer the same question
            in incompatible ways, so this is a radio, not a pair of
            toggles: reveals are either derived or painted, never both.
            Switching does NOT clear revealed_cells, so a DM can flip to
            dynamic for a fight and back without losing their painting. */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 8,
          }}>
            Fog of war
          </div>
          {([
            {
              id: 'dynamic' as const,
              label: 'Dynamic lighting',
              hint: 'Players see what their characters can see — line of sight through walls, limited by darkvision and carried light. Updates as tokens move.',
            },
            {
              id: 'manual' as const,
              label: 'Manual fog',
              hint: 'You paint what is revealed with the ☁ brush, and it stays revealed. Walls, darkvision and light are ignored.',
            },
          ]).map(m => (
            <label
              key={m.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 10px', marginBottom: 6, cursor: 'pointer',
                borderRadius: 'var(--r-sm, 4px)',
                background: fogMode === m.id ? 'rgba(103,232,249,0.10)' : 'transparent',
                border: `1px solid ${fogMode === m.id ? 'rgba(103,232,249,0.55)' : 'var(--c-border)'}`,
              }}
            >
              <input
                type="radio"
                name="fog-mode"
                checked={fogMode === m.id}
                onChange={() => setFogMode(m.id)}
                style={{ marginTop: 2 }}
              />
              <span>
                <span style={{
                  display: 'block', fontSize: 12,
                  color: fogMode === m.id ? 'var(--t-1)' : 'var(--t-2)',
                  fontWeight: fogMode === m.id ? 700 : 500,
                }}>
                  {m.label}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4 }}>
                  {m.hint}
                </span>
              </span>
            </label>
          ))}
          <div style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 2 }}>
            Either way, the LIGHT buttons on the toolbar still decide whether
            fog renders at all — a Bright scene shows everything.
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--t-2)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            <span>Published (visible to players)</span>
          </label>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          paddingTop: 12, borderTop: '1px solid var(--c-border)',
        }}>
          <button
            onClick={doDelete}
            disabled={deleting}
            style={{
              padding: '6px 14px',
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#f87171',
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              cursor: deleting ? 'wait' : 'pointer',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete Scene'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                background: 'var(--c-raised)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'var(--t-2)',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '6px 14px',
                background: 'rgba(167,139,250,0.22)',
                border: '1px solid rgba(167,139,250,0.5)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#a78bfa',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
