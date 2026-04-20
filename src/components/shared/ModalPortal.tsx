import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * v2.62.0 — Modal portal wrapper.
 *
 * The character sheet wrapper (`.cs-shell` / `.animate-fade-in`) has a CSS
 * `transform` set by its fade-in animation. Per CSS spec, ANY non-`none`
 * transform on an ancestor creates a new containing block for `position: fixed`
 * descendants — so any `.modal-overlay` rendered inside the cs-shell ends up
 * anchored to the wrapper instead of the viewport. Result: modal appears in a
 * weird scrolled-down position with `margin: auto` computing huge values.
 *
 * Wrapping every modal in this component portal-mounts it directly on
 * document.body, escaping all transformed ancestors. `position: fixed` then
 * works correctly relative to the viewport and the overlay centers cleanly.
 *
 * Usage:
 *   {showModal && (
 *     <ModalPortal>
 *       <div className="modal-overlay" onClick={...}>
 *         <div className="modal" onClick={e => e.stopPropagation()}>...</div>
 *       </div>
 *     </ModalPortal>
 *   )}
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
