// v2.354.0 — Folder browser sidebar for the unified Creatures Manager.
//
// Lives in the left rail of the NPC tab. Lists folders the calling
// user can see (their own + campaign-member-readable ones), plus
// virtual entries for "All" (no filter) and "Unfiled" (folder_id null).
//
// Actions:
//   • Click folder → notifies parent which filters the creature list
//   • "+ New Folder" button at top → inline name input → creates
//   • Hover → kebab menu reveals → Rename (inline edit) / Delete
//   • Delete asks for confirmation; creatures in the folder become
//     unfiled (folder_id set NULL by the FK ON DELETE SET NULL)
//
// Two-level rendering at most for simplicity. The DB allows nesting
// via parent_folder_id → CASCADE delete; the UI just doesn't render
// past one level for v2.354 — folders stay flat. Nested folders is
// a v2.355+ enhancement if it actually proves useful.

import { useEffect, useState } from 'react';
import {
  listFolders, createFolder, renameFolder, deleteFolder,
  type CreatureFolderRow,
} from '../../lib/api/creatureFolders';

interface Props {
  campaignId: string;
  selectedFolderId: string | null | 'all' | 'unfiled';
  onSelect: (folderId: string | null | 'all' | 'unfiled') => void;
  isOwner: boolean;
}

export default function CreatureFolderBrowser({
  campaignId, selectedFolderId, onSelect, isOwner,
}: Props) {
  const [folders, setFolders] = useState<CreatureFolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    let alive = true;
    listFolders(campaignId)
      .then(rows => { if (alive) { setFolders(rows); setLoading(false); } })
      .catch(err => { console.error('[FolderBrowser] listFolders failed', err); setLoading(false); });
    return () => { alive = false; };
  }, [campaignId]);

  async function refresh() {
    try {
      const rows = await listFolders(campaignId);
      setFolders(rows);
    } catch (err) {
      console.error('[FolderBrowser] refresh failed', err);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { setCreating(false); return; }
    try {
      await createFolder({ name: newName, campaignId });
      setNewName('');
      setCreating(false);
      await refresh();
    } catch (err) {
      console.error('[FolderBrowser] create failed', err);
    }
  }

  async function handleRename(id: string) {
    if (!renameDraft.trim()) { setRenamingId(null); return; }
    try {
      await renameFolder(id, renameDraft);
      setRenamingId(null);
      await refresh();
    } catch (err) {
      console.error('[FolderBrowser] rename failed', err);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete folder "${name}"?\n\nCreatures inside become unfiled. Folders can't be recovered.`)) return;
    try {
      await deleteFolder(id);
      // If we just deleted the selected folder, fall back to All.
      if (selectedFolderId === id) onSelect('all');
      await refresh();
    } catch (err) {
      console.error('[FolderBrowser] delete failed', err);
    }
  }

  // Only top-level folders for v2.354 (parent_folder_id null).
  const rootFolders = folders.filter(f => !f.parent_folder_id);

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)',
      borderRight: '1px solid var(--c-border)',
      paddingRight: 'var(--sp-3)',
    }}>
      <div className="section-header" style={{ marginTop: 0 }}>Folders</div>

      {/* Virtual entries */}
      <FolderRow
        label="All Creatures"
        selected={selectedFolderId === 'all'}
        onClick={() => onSelect('all')}
      />
      <FolderRow
        label="Unfiled"
        selected={selectedFolderId === 'unfiled'}
        onClick={() => onSelect('unfiled')}
        muted
      />

      <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />

      {/* User folders */}
      {loading && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', padding: '6px 8px' }}>
          Loading…
        </div>
      )}
      {!loading && rootFolders.length === 0 && !creating && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', padding: '6px 8px', fontStyle: 'italic' }}>
          No folders yet.
        </div>
      )}
      {rootFolders.map(f => (
        renamingId === f.id ? (
          <input
            key={f.id}
            value={renameDraft}
            onChange={e => setRenameDraft(e.target.value)}
            onBlur={() => handleRename(f.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRename(f.id);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            autoFocus
            style={{ fontSize: 'var(--fs-sm)', padding: '4px 8px' }}
          />
        ) : (
          <FolderRow
            key={f.id}
            label={f.name}
            selected={selectedFolderId === f.id}
            onClick={() => onSelect(f.id)}
            onRename={isOwner ? () => { setRenamingId(f.id); setRenameDraft(f.name); } : undefined}
            onDelete={isOwner ? () => handleDelete(f.id, f.name) : undefined}
          />
        )
      ))}

      {/* Create folder */}
      {isOwner && (creating ? (
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onBlur={handleCreate}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
          }}
          placeholder="Folder name…"
          autoFocus
          style={{ fontSize: 'var(--fs-sm)', padding: '4px 8px' }}
        />
      ) : (
        <button
          className="btn-ghost btn-sm"
          onClick={() => setCreating(true)}
          style={{
            justifyContent: 'flex-start',
            fontSize: 'var(--fs-xs)', color: 'var(--t-2)',
            padding: '6px 8px', minHeight: 0,
          }}
        >
          + New Folder
        </button>
      ))}
    </aside>
  );
}

interface RowProps {
  label: string;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FolderRow({ label, selected, muted, onClick, onRename, onDelete }: RowProps) {
  const [hover, setHover] = useState(false);
  const showActions = hover && (onRename || onDelete);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 8px',
        borderRadius: 'var(--r-sm, 4px)',
        background: selected ? 'rgba(167,139,250,0.18)' : 'transparent',
        color: selected ? '#c4b5fd' : muted ? 'var(--t-3)' : 'var(--t-1)',
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)',
        cursor: 'pointer',
        transition: 'background var(--tr-fast)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        📁 {label}
      </span>
      {showActions && (
        <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {onRename && (
            <button
              onClick={e => { e.stopPropagation(); onRename(); }}
              title="Rename"
              style={{
                fontSize: 10, padding: '1px 5px', minHeight: 0,
                background: 'transparent', border: '1px solid var(--c-border)',
                borderRadius: 3, color: 'var(--t-2)', cursor: 'pointer',
              }}
            >✎</button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              title="Delete"
              style={{
                fontSize: 10, padding: '1px 5px', minHeight: 0,
                background: 'transparent', border: '1px solid rgba(239,68,68,0.45)',
                borderRadius: 3, color: '#fca5a5', cursor: 'pointer',
              }}
            >×</button>
          )}
        </span>
      )}
    </div>
  );
}
