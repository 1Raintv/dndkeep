import type { UndoableAction } from '../hooks/useUndoRedo';

export type Position = { x: number; y: number };
export type TokenMove = { id: string; from: Position; to: Position };

/** v2.699 — retry partially saved group undo without moving a token twice.
 * Refuse to overwrite a newer move by a player or another DM window. */
export function createTokenMoveHistory(moves: TokenMove[], ports: {
  read: (id: string) => Position | undefined;
  blocked: (id: string) => boolean;
  save: (id: string, position: Position) => Promise<void>;
}): UndoableAction {
  const applied = new Set(moves.map(m => m.id));
  const same = (a: Position | undefined, b: Position) => !!a && a.x === b.x && a.y === b.y;
  const run = async (forward: boolean) => {
    const pending = moves.filter(m => applied.has(m.id) !== forward);
    for (const m of pending) {
      if (ports.blocked(m.id) || !same(ports.read(m.id), forward ? m.from : m.to)) {
        throw new Error('Token changed or is being moved. History cannot overwrite it.');
      }
    }
    for (const m of pending) {
      // Recheck after earlier saves yield to other clients.
      if (ports.blocked(m.id) || !same(ports.read(m.id), forward ? m.from : m.to)) throw new Error('Token changed during save.');
      await ports.save(m.id, forward ? m.to : m.from);
      if (forward) applied.add(m.id); else applied.delete(m.id);
    }
  };
  return { label: moves.length > 1 ? 'move tokens' : 'move token', forward: () => run(true), backward: () => run(false) };
}
