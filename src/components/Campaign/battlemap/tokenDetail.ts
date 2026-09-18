/** v2.706 — overview zoom should show the board, not unreadable text.
 * Selected/active tokens retain their details; game-state graphics stay visible. */
export function showTokenDetail(zoom: number, selected: boolean, active: boolean): boolean {
  return zoom >= 0.65 || selected || active;
}

/** Keep a focused name readable at overview scale, but cap enlargement so
 * a very distant token cannot turn its name into a screen-sized overlay. */
export function tokenNameScale(base: number, zoom: number, focused: boolean): number {
  return focused ? Math.max(base,Math.min(2,.85/Math.max(.01,zoom))) : base;
}
