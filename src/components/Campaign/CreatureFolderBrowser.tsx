// v2.354.0 — Folder browser sidebar for the NPC manager.
//
// Left rail showing the user's creature folders for the active
// campaign. Two virtual entries at the top ("All Creatures" and
// "Unfiled") + per-folder rows + an inline "+ New Folder" footer.
// Selecting a folder filters the creature list in the parent
// NPCManager via the selectedFolderId / onSelect props.
//
// Folder management: create (inline input), rename (click pencil to
// inline-edit), delete (click × with confirm). All three use the
// helpers from src/lib/api/creatureFolders.ts.
//
// Self-contained: this component owns its folder load + reload
// lifecycle. Parent doesn't need to manage folder state — passes only
// the campaign + selection callbacks.

import { useEffect, useState, useCallback } from 'react';
import {
  listFolders, createFolder, renameFolder, deleteFolder,
  type CreatureFolderRow,
} from '../../lib/api/creatureFolders';

export type FolderSelection = 'all' | 'unfiled' | string;

interface Props {
  campaignId: string;
  selectedFolderId: FolderSelection | null;
  onSelect: (sel: FolderSelection) => void;
  isOwner: boolean;
}

export default function CreatureFolderBrowser({
  campaignId, selectedFolderId, onSelect, isOwner,
}: Props) {
  const [folders, setFolders] = useState<CreatureFolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const reload = useCallback(async () => {
    try {
      const rows = await listFolders(campaignId);
      setFolders(rows);
    } catch (err) {
      console.error('[CreatureFolderBrowser] listFolders failed', err);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { reload(); }, [reload]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { setCreatingNew(false); setNewName(''); return; }
    try {
      await createFolder({ name, campaignId });
      setNewName('');
      setCreatingNew(false);
      await reload();
    } catch (err) {
      console.error('[CreatureFolderBrowser] createFolder failed', err);
    }
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    try {
      await renameFolder(id, name);
      setEditingId(null);
      await reload();
    } catch (err) {
      console.error('[CreatureFolderBrowser] renameFolder failed', err);
    }
  }

  async function handleDelete(f: CreatureFolderRow) {
    if (!window.confirm(`Delete folder "${f.name}"? Creatures inside become unfiled (not deleted).`)) return;
    try {
      await deleteFolder(f.id);
      if (selectedFolderId === f.id) onSelect('all');
      await reload();
    } catch (err) {
      console.error('[CreatureFolderBrowser] deleteFolder failed', err);
    }
  }

  // v2.354 renders only root folders (parent_folder_id null). The
  // schema supports nesting via parent_folder_id but the UI is flat
  // until a real "Battle 1 / Encounter A" use case asks for nesting.
  const rootFolders = folders.filter(f => f.parent_folder_id === null);

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid var(--c-border)',
      paddingRight: 'var(--sp-3)',
      display: 'flex', flexDirection: 'column', gap: 4,
      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)',
    }}>
      <div style={{
        fontSize: 'var(--fs-xs)', color: 'var(--t-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        fontWeight: 700, padding: '4px 8px',
      }}>
        Folders
      </div>

      <FolderRow
        label="All Creatures"
        active={selectedFolderId === 'all' || selectedFolderId === null}
        onClick={() => onSelect('all')}
      />
      <FolderRow
        label="Unfiled"
        active={selectedFolderId === 'unfiled'}
        onClick={() => onSelect('unfiled')}
      />

      <div style={{ height: 1, background: 'var(--c-border)', margin: '6px 0' }} />

      {loading && (
        <div style={{ padding: '6px 10px', color: 'var(--t-3)', fontSize: 'var(--fs-xs)' }}>
          Loading…
        </div>
      )}

      {!loading && rootFolders.map(f => (
        editingId === f.id ? (
          <input
            key={f.id}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => handleRename(f.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename(f.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            autoFocus
            style={{ fontSize: 'var(--fs-sm)' }}
          />
        ) : (
          <FolderRow
            key={f.id}
            label={f.name}
            active={selectedFolderId === f.id}
            onClick={() => onSelect(f.id)}
            onRename={isOwner ? () => { setEditingId(f.id); setEditName(f.name); } : undefined}
            onDelete={isOwner ? () => handleDelete(f) : undefined}
          />
        )
      ))}

      {isOwner && (
        creatingNew ? (
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={handleCreate}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreatingNew(false); setNewName(''); }
            }}
            placeholder="Folder name…"
            autoFocus
            style={{ fontSize: 'var(--fs-sm)' }}
          />
        ) : (
          <button
            onClick={() => setCreatingNew(true)}
            style={{
              background: 'transparent', border: '1px dashed var(--c-border)',
              color: 'var(--t-2)', fontSize: 'var(--fs-xs)',
              padding: '6px 10px', borderRadius: 4,
              cursor: 'pointer', textAlign: 'left',
              marginTop: 4,
            }}
            title="Create a new folder"
          >
            + New Folder
          </button>
        )
      )}
    </aside>
  );
}

// ── Sub-component ─────────────────────────────────────────────

interface FolderRowProps {
  label: string;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FolderRow({ label, active, onClick, onRename, onDelete }: FolderRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 4,
        cursor: 'pointer',
        background: active ? 'rgba(234,179,8,0.12)' : (hovered ? 'rgba(255,255,255,0.04)' : 'transparent'),
        color: active ? 'var(--c-gold-l)' : 'var(--t-1)',
        border: active ? '1px solid rgba(234,179,8,0.35)' : '1px solid transparent',
        fontWeight: active ? 600 : 400,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>

      {(onRename || onDelete) && hovered && (
        <span style={{ display: 'flex', gap: 2 }}>
          {onRename && (
            <button
              onClick={e => { e.stopPropagation(); onRename(); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '0 4px', color: 'var(--t-2)', fontSize: 12,
              }}
              title="Rename"
            >✎</button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '0 4px', color: 'var(--t-2)', fontSize: 12,
              }}
              title="Delete"
            >×</button>
          )}
        </span>
      )}
    </div>
  );
}
