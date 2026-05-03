# Modal Pattern

**As of v2.395.3 / v2.396.0.** Every modal in DNDKeep should follow
this pattern. Tested against the user's "stop the jumping" feedback
on CharacterSettings — multi-tab modals that grow and shrink between
tabs caused the close button to move under the cursor between clicks,
which was reported as "jarring". The mitigation has three pieces and
they all matter.

## The pattern

```tsx
import ModalPortal from '../shared/ModalPortal';

<ModalPortal>
  <div
    className="modal-overlay"
    onClick={onClose}
    style={{
      // Override the base overlay's center alignment. With center
      // alignment, ANY change in modal height shifts the modal's TOP
      // by half the delta, which the user sees as "jumping".
      // Anchoring to the top means growth happens downward only —
      // top stays pinned regardless of what's inside.
      alignItems: 'flex-start',
      paddingTop: 'var(--sp-6)',
    }}
  >
    <div
      className="modal"
      style={{
        maxWidth: 760,
        width: '100%',
        padding: 'var(--sp-5) var(--sp-6) var(--sp-6)',

        // Lock height. Without this, tall content makes the modal
        // grow past the locked region and the top still moves on
        // browsers where align-items: flex-start doesn't engage
        // until after layout.
        height: 'clamp(480px, calc(100dvh - 64px), 760px)',

        // Override .modal's default overflow-y: auto so only the
        // body below scrolls (one scroll container, not two).
        overflow: 'hidden',
        // Override .modal's default max-height so our explicit
        // height wins on every browser.
        maxHeight: 'none',

        // Restate flex column so child layout is predictable. The
        // base CSS already sets these but stating them locally
        // makes the intent obvious.
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header — flex-shrink:0 so it never collapses */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--sp-4)',
        flexShrink: 0,
      }}>
        <h2>Title</h2>
        <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>

      {/* Tab strip if applicable — also flex-shrink:0 */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--c-border)',
        marginBottom: 'var(--sp-5)',
        flexShrink: 0,
      }}>
        {/* tab buttons */}
      </div>

      {/* Body wrapper — fills remaining space and scrolls internally.
          minHeight: 0 is REQUIRED on flex items to let them shrink
          below their content's natural min-content size — without it,
          content height "wins" and forces the modal to grow. */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        // Pull the scroll viewport flush to the modal's existing
        // horizontal padding so a vertical scrollbar (when needed)
        // sits at the modal edge, not floating in the middle.
        marginRight: 'calc(-1 * var(--sp-6))',
        paddingRight: 'var(--sp-6)',
      }}>
        {/* tab content here */}
      </div>
    </div>
  </div>
</ModalPortal>
```

## Why each piece is non-negotiable

1. **`<ModalPortal>`** — escapes transformed ancestors. Without it,
   `position: fixed` is anchored to the wrapper instead of the
   viewport on any page where an ancestor has a CSS transform (any
   page that uses the cs-shell fade-in animation, for instance).
   Original symptom: modals appearing way down the page or off-screen
   in some windows. Fixed at v2.62.0.

2. **`alignItems: 'flex-start' + paddingTop`** on the overlay —
   anchors the modal to the top so even if its height changes between
   states, the top edge stays put. Original symptom: clicking through
   tabs in CharacterSettings made the modal frame jump because the
   overlay's `align-items: safe center` shifted the modal's top by
   half of any height delta. Fixed at v2.395.3.

3. **`height: clamp(...)`** + override `maxHeight: 'none'` and
   `overflow: 'hidden'` on the modal — locks the modal to a single
   computed size so there's no height delta to centre. Belt-and-
   suspenders with #2: even if a future change re-introduces
   centering somewhere, the locked height keeps things stable.
   Without overriding `maxHeight: 'none'`, the base CSS's
   `max-height: calc(100dvh - 32px)` can win on viewports where
   the dvh fallback ordering varies.

4. **Body wrapper `flex: 1; minHeight: 0; overflowY: auto`** —
   `flex: 1` fills the remaining locked space, `minHeight: 0` lets
   flex children shrink below their content's natural size (without
   this, content height propagates back up and forces the modal to
   grow), `overflowY: auto` keeps long content scrollable inside.

5. **`flexShrink: 0`** on the header and tab strip — header and tab
   strip should not be allowed to shrink (otherwise they'd collapse
   when the body grows). The body wrapper already takes everything
   remaining via `flex: 1`.

## Common mistakes

- **Forgetting `minHeight: 0`** on the body wrapper. Default flex
  item `min-height: auto` makes it match content min-content size,
  which propagates up and overrides the parent's `height` lock.
  This is what made v2.395.0 fail.

- **Adding `min-height` instead of `height` to the modal.** The
  modal is then floored, but tall content makes it grow above the
  floor and the top moves on tab switch. This is what made v2.395.0
  AND v2.395.1 fail.

- **Using the base `.modal-body` / `.modal-header` / `.modal-footer`
  slot classes from globals.css.** Those work for slotted modals
  but don't compose cleanly with custom inner layouts (tabs,
  multi-section forms). For complex modals, render content
  directly in `.modal` and apply the wrapper pattern above.

- **Centering the modal on the overlay.** This is what
  `.modal-overlay` does by default — and that's fine for one-shot
  modals whose height never changes. For ANY modal with state-
  driven content (tabs, expand/collapse sections, async-loaded
  data), override to top-anchored.

## What to do for new modals

If the modal is a single short form with no state-driven height
changes — just use `<ModalPortal>` + the base `.modal-overlay` /
`.modal` classes, no overrides needed.

If the modal has tabs, expandable sections, async-loaded content,
or any state that changes its height — use the full pattern above.
The CharacterSettings modal at `src/components/CharacterSheet/
CharacterSettings.tsx` is the reference implementation.
