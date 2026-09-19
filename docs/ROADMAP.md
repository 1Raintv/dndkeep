# DNDKeep — Two-Track Roadmap

**Established:** July 2026 (chat 15)
**Status:** Living document. Update as tracks progress.

### 2026-09-19 — Clear dimension validation, v2.734

Scene settings preserves numeric drafts instead of truncating fractions as they
are entered. Blank, fractional and out-of-range dimensions are rejected before
any write, with the field name and allowed whole-number range shown in the
focused alert inside settings. Numeric fields have accessible names; Fit to map
image is disabled until grid size is valid.

Validation: full gate passed (936 unit tests, TypeScript 221/221, build and entry
budget). Fractional-value mutation fails three cases. Four isolated desktop/mobile
browser checks pass using the real dialog with intercepted save/delete responses:
invalid drafts never write, typed values survive, retries work, and short-screen
controls remain reachable. Removing validation feedback fails the browser test.
After Docker was restored, all four database-backed desktop/mobile checks passed:
invalid drafts, zero writes, correction, confirmed save/delete recovery and fog.
Screenshots inspected in the full app as well as the isolated fixture. No database
changes. Personal encounter mode remains queued.

### 2026-09-19 — Scene settings layout, v2.733

Scene settings scrolls its fields independently of the title and action footer.
Save, Cancel and Delete retain 44px targets and stay reachable on short screens,
including after save/delete errors. Radio buttons and the published checkbox have
explicit compact dimensions so global text-input styles no longer squeeze their
labels. Fog descriptions use the more readable secondary text color.

Validation covers the full gate and desktop/mobile settings, keyboard navigation,
save/delete recovery and a 480px-high viewport. No database changes.
Personal encounter mode remains queued.

### 2026-09-19 — Scene deletion recovery, v2.732

Scene deletion now requires a returned deleted row before removing the scene
locally. A synchronous reservation spans confirmation and the request, blocking
duplicate deletes, competing saves and dismissal while deleting. Failed requests
preserve drafts and allow retry. Save/delete errors now appear as focused alerts
inside settings, where the modal backdrop cannot obscure them.

Validation: full gate (923 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and entry budget); local desktop/mobile browser coverage holds and rejects
a deletion, verifies disabled controls and preserved drafts, then retries against
the database using a disposable scene. Existing settings/save/fog coverage remains.
API regression fails when returned-row verification is removed. No schema changes.
Personal encounter mode remains queued.

### 2026-09-19 — Confirmation dialogs above map settings, v2.731

Shared confirmations/prompts now render through the existing body portal at
z-index 40000, above scene settings (30000). Previously the scene-delete
confirmation existed in the DOM but settings covered it and intercepted pointer
clicks. The regression now clicks Cancel, reopens and tests Escape, preserving
settings drafts without deleting a scene.

Validation: full gate passed (921 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.5 KB entry). Four desktop/mobile browser checks
passed for scene settings/save/fog and fullscreen group confirmation/undo/reconnect.
The pointer Cancel check failed before the fix. Screenshots inspected on both
viewports; shared overflow probe found no dialog clipping or sideways scrolling
(existing underlying map/sidebar/party-bar findings remain). No schema changes.
Personal encounter mode remains queued.

### 2026-09-19 — Confirm scene settings before updating the map, v2.730

Scene settings applies its local patch only after the database confirms an
updated row. Failed/zero-row saves keep edits open with a retry message;
exceptions use the same recovery. A synchronous reservation blocks duplicate
saves, disables the form and prevents dismissal until the request settles.
The shared updateScene API now verifies an affected row instead of accepting
an error-free zero-row response. Permissions and schema are unchanged.

Validation: full gate passed (921 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile local browser checks
hold and reject a save, verify disabled controls, Escape blocking, unchanged
scene options and preserved draft text, then retry successfully and persist fog
strokes. Removing returned-row verification fails the API regression.
Personal encounter mode remains queued.

### 2026-09-18 — Scene settings keyboard ownership, v2.729

Scene settings is now a named modal dialog, so map shortcut guards recognize it.
Opening focuses the scene name; Tab/Shift+Tab stay within enabled visible
controls. Closing restores the opener. Escape dismisses settings without reaching
the map, but yields to a nested confirmation. Canceling scene deletion preserves
draft settings and restores focus to Delete Scene.

Validation: full gate passed (920 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile local browser checks
cover initial focus, both Tab boundaries, nested Escape, preserved draft text,
return focus, discarded edits on Cancel, then saving settings and persisted fog
strokes. Removing the nested-dialog guard fails the regression. No schema or
layout changes. Personal encounter mode remains queued.

### 2026-09-18 — Keep map undo out of dialogs and text editing, v2.728

Map Undo/Redo shortcuts now leave editable ancestors, ARIA textboxes/dialogs,
visible modal dialogs, composition, Alt-modified keys and already-handled events
alone. Empty history does not consume the shortcut. Held keys cannot drain the
history after each save finishes; a fresh press still works normally.

Validation: full gate passed (920 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile multiplayer checks
open the real group-delete confirmation, verify Ctrl+Z creates no movement writes
or position changes on either client, cancel, then verify normal undo/redo and
reconnect behavior. New unit tests fail against the previous implementation.
No schema/layout changes. Personal encounter mode remains queued.

### 2026-09-18 — Repeated framing preserves Previous view, v2.727

Repeated Fit map or Find selection no longer replaces the saved return point
when the destination matches the current camera (within floating-point noise).
A genuine position or zoom change still remembers the latest view. Held F/0
shortcuts run once per press; held zoom keys continue to repeat normally.

Validation: full gate passed (915 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
repeat Fit, F and Find selection, then verify restoration of the original camera.
Unit coverage includes unchanged views, rounding noise, zoom-only changes and
held-key behavior. Removing the unchanged-view guard fails two regressions.
No schema/layout changes. Personal encounter mode remains queued.

### 2026-09-18 — Return to the previous camera view, v2.726

The arrow beside Fit map restores the position and zoom from before the latest
Fit map or Find selection jump (including F/0 shortcuts). It is a single return
point, cleared after use or a scene/viewport change. Ordinary panning and zooming
do not overwrite it. Restoring stops camera momentum and supports fitted zooms
below 25%. Camera history stays local and separate from token undo.

Validation: full gate passed (912 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
passed for actual camera restoration after Fit/Find, disabled state after return,
and the existing navigation/help flow. Unit checks cover latest-jump replacement
and scene/viewport invalidation; removing center restoration fails two cases.
Screenshots inspected; shared overflow probe reports no new control clipping or
sideways scrolling (existing underlying map/sidebar findings remain). No new
mobile dock row. No schema changes; personal encounter mode remains queued.

v2.725 deployment was confirmed successful and live before this batch.

### 2026-09-18 — Shortcuts-first map help, v2.725

Map help opens with navigation shortcuts. Grid appearance now lives in a native,
keyboard-accessible disclosure below them, with a visible focus ring and a
44 px target. Grid preferences, reset and persistence are unchanged. Scoped
summary styles keep the help toggle separate from the nested settings control.

Validation: full gate passed (909 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
passed for shortcut visibility, Enter/Space expansion and collapse, and live grid
updates/reset/reload with no shared writes. Screenshots inspected; shared overflow
probe reports no new control clipping or sideways scrolling (existing underlying
map/sidebar findings remain). Forcing settings open fails the new regression.
The pan test now releases toolbar focus before Space and explicitly verifies
camera movement without token movement. No schema changes; personal play queued.

Release note: v2.724 was merged with passing CI, but Vercel had not created a
deployment and production still served v2.723 when this batch began.

### 2026-09-18 — Find selection keyboard shortcut, v2.724

Press F over the unobstructed map to frame selected tokens using the same
control-aware camera framing as Find selection. The key remains untouched when
nothing is selected, during typing/dialogs, modified browser shortcuts or active
pointer gestures. Help and the button tooltip now explain the shortcut.

Validation: full gate passed (909 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks
compare the actual camera against button framing after panning away. Two new
regressions fail when F handling is removed. Help screenshots inspected after
scrolling to the shortcut; shared overflow checks show no sideways scrolling or
new control clipping (existing underlying map/sidebar findings remain).
No database changes. Personal encounter mode remains queued.

### 2026-09-18 — Click-to-move save protection, v2.723

Click movement now shares the per-token reservation used by dragging, nudging
and undo/redo, from validation through animation, save and movement logging.
Repeated clicks and drags explain why a move is busy. Failed position saves
restore the origin, spend no movement and display a retry message. Rejected
requests are handled immediately while animation finishes. No schema changes.

Validation: release gate passed (907 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop and mobile local-database
browser checks passed: held click save blocks a second click and drag with one
write, failure restores position/budget, and subsequent real player movement
persists and spends exactly 5 ft. Personal encounter mode remains queued.

### 2026-09-18 — Shared pending movement protection, v2.722

Single-token drag saves, group saves, arrow-key/button nudges and token move
undo/redo now share per-token save reservations in this browser. A pending member
blocks the entire formation before optimistic nudge/save changes; unrelated tokens
remain usable. Group reservations last until every member settles, and failures
release them. Old/repeated cleanup cannot release a newer operation's reservation.
Single-token drag no longer keeps a separate private pending set. Existing server
permissions and peer drag locks remain authoritative; this is local coordination.

Validation: release gate passed (903 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Unit coverage includes atomic group
reservation, cleanup ownership, failed saves, blocked nudges and undo retry.
Browser coverage extends delayed drag saves with a selected-token ArrowRight
attempt, unchanged position and one request, plus normal multiplayer group
cancel/undo/reconnect. No schema changes. Personal encounter mode remains queued.

### 2026-09-18 — Group move feedback and crowded names, v2.721

Group dragging outlines every original and snapped destination footprint, with
a zoom-stable token count/distance/Grid snap label. Dropping shows Saving group
move until the existing partial-success save path finishes. Cancel, scene teardown
and completion clear the overlay. Group permissions, shared grid delta and undo
semantics are preserved.

Single-token drops show Saving move while validation/persistence settle and block
another single-token drag of that token during the pending request. Existing
rejection feedback and origin restoration remain; save badges clear on completion
and viewport teardown.

Crowded names yield to token bodies, HP bars, conditions and status indicators.
Active/selected names take priority over other names; deterministic selection
prevents order-dependent flicker. Layout runs at most ten times a second and names
return when clear space opens. HP/status visibility and token hit areas are unchanged.

Validation: release gate passed (896 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Six desktop/mobile browser checks passed;
coverage
checks pending/rejected saves, second-drag blocking, group previews and multiplayer
cancel/undo/reconnect, plus colliding and separated names. Removing collision
filtering fails two regression cases. Screenshots inspected; shared overflow checks
found no sideways scrolling or new control clipping (existing underlying map/sidebar
findings remain). No schema changes; personal play stays queued.

### 2026-09-18 — Readable token drag feedback, v2.720

Single-token drag distance text, dashed paths and destination outlines now retain
their screen size when zooming. The destination has a tinted footprint and a
contrasting border; a faint origin outline distinguishes start from landing.
The distance label explicitly says Grid snap and stays within the canvas edges.
Existing size-aware snap, distance calculation and drop rules are preserved.
Blocked starts now explain remote drag locks, missing control, out-of-combat DM
control, wrong turns, locked tokens and exhausted movement instead of silently
ignoring the press. No authorization or movement-budget changes.

Validation: release gate passed (893 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Six desktop/mobile browser checks
passed for zoom-stable feedback, remote-lock explanations and multiplayer drag
cancellation, including zero persisted writes on cancellation. Screenshots
inspected; shared overflow probe reports no sideways scroll or new UI clipping
(existing underlying sidebar/map findings remain). Removing label counter-scaling
fails the regression. Personal encounter mode remains queued.

### 2026-09-18 — Rename directly in token options, v2.719

Token renaming now uses a focused, prefilled input inside the token menu instead
of a competing modal. Enter saves; Cancel/Back return to options; Escape closes
the menu without exiting the fullscreen map. Blank names cannot submit, whitespace
is trimmed, and failed saves retain the draft for retry. Existing confirmed-save
handling still prevents overlapping writes and premature local changes.

Validation: release gate passed (884 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Desktop/mobile browser checks cover
prefill, focus, blank names, rejected Enter saves, retained drafts, cancel and
Escape, with unchanged fixture tokens. Screenshots inspected; no new rename-menu
clipping or sideways scroll. No schema changes. Personal encounter mode stays queued.

### 2026-09-18 — Confirmed token-menu saves, v2.718

Token edits, deletion and duplication now wait for the API's boolean success
before changing local state. The menu stays open with disabled actions while
saving, blocks overlapping requests and reports failure with a retryable menu.
False results and exceptions both fail; unsuccessful duplication no longer leaves
a phantom token. Late results cannot inject tokens into a different scene, and
existing realtime duplicate metadata is preserved. Errors after unmount use a toast.

Placement-backed locking/control reassignment now explains that those fields are
unsupported rather than pretending they persisted. Placement renames require a
real placement lookup and a returned identity row; zero-row renames fail.

Validation: full release gate passed (882 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Four desktop/mobile browser checks
passed, including a rejected edit, a real local-DB retry and fixture restoration,
plus existing keyboard/menu navigation. Unit coverage includes pending/double
clicks, false/throw failures, retry, deletion, duplicate failure, scene changes,
unsupported fields and zero-row renames. No migrations or permission changes.

### 2026-09-18 — Keyboard-accessible token actions, v2.717

Clickable token-menu rows and color swatches are native buttons with visible
focus outlines, Tab traversal and Enter/Space activation. Opening a menu focuses
its first action; submenus start at Back. Color swatches have explicit names and
pressed-state reporting. Space on a focused control no longer triggers temporary
map pan. Existing token handlers, permissions and save behavior are unchanged.

Validation: release gate passed (875 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry). Four desktop/mobile menu and camera
checks passed, including keyboard-only submenu entry/return, action names,
resize/landscape, touch dismissal and unchanged token data. Removing actions
from Tab order fails the regression. No database changes; personal play remains queued.
Two final desktop/mobile visual checks also passed. Focus screenshots inspected;
shared overflow checks found no new clipping or sideways scrolling (existing
underlying sidebar/map findings remain).

### 2026-09-18 — Return from token submenus, v2.716

Size, color, facing, light and player-control submenus now have a sticky
Back to token options button. Opening a submenu focuses Back for immediate
keyboard return. Outside dismissal uses pointer events so touch taps work
without relying on compatibility mouse events; the opening pointer event is
excluded. Internal taps and Back preserve the menu. Escape still closes the
menu without leaving fullscreen. Existing actions and permissions are unchanged.

Desktop/mobile browser coverage checks repeated submenu returns, Enter activation,
outside touch dismissal, landscape/resizing and unchanged token data. Disabling
Back fails the regression. No database changes; personal encounter mode stays queued.
Release gate passed (875 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and 252.4 KB entry). Four final desktop/mobile menu and camera checks passed;
screenshots inspected and shared overflow probe found no new clipping or sideways
scrolling, with existing underlying sidebar/map findings unchanged.

### 2026-09-18 — Reachable token menus, v2.715

Token options and every submenu now measure their actual rendered size rather
than assuming a 240px menu. Width/height are capped to the visible viewport;
long menus scroll, with 40px rows for easier targeting. Opening a different
submenu resets its scroll and recalculates placement. Window/visual-viewport
resizes and content changes reposition it within an 8px margin.

Escape now closes the topmost token menu before fullscreen listeners run.
Existing token actions and permissions are unchanged. Desktop, mobile and
landscape browser checks exercise resize while open, bottom-item reachability,
light submenu placement, Escape and unchanged token data. Screenshots inspected;
the shared overflow probe found no new menu clipping or sideways scroll.
Removing the height cap fails the regression. Personal-play planning remains
queued below; no database changes in this release.
Release gate passed (875 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build, 252.4 KB entry); four final desktop/mobile menu and camera-key checks passed.

### Queued 2026-09-18 — Independent player / personal encounter mode

**Requested by Jared; deferred implementation. Map improvements remain the
active priority.** Make the character sheet useful at an external table or for
solo play without requiring a DNDKeep campaign or granting campaign DM powers.

Current evidence: `createCombatStore` returns an empty encounter without a
campaign; the sheet mounts `InitiativeStrip` with `isDM={false}`, and its turn
advance/end controls are DM-only. Several reaction/death-save listeners are
campaign-gated. `resolveAutomation` already supports a null campaign and built-in
defaults; character settings already expose automation overrides. Audit which
sheet actions already work independently before adding duplicate controls.

Recommended delivery order:

1. **Track my turns (first useful release).** Owner starts a personal encounter
   directly from the sheet, explicitly starts/ends their own turn and ends the
   encounter. Between-turn state preserves reaction timing; a new turn restores
   only resources whose rules specify that timing. Reuse existing start/end-turn
   rules for conditions, durations and prompts. Short/long rests remain separate
   explicit actions. Do not infer enemy turns or automatically advance a table's
   initiative. Keep this small enough to use beside a physical game or other VTT.
2. **Personal automation preferences.** Expose existing Off/Prompt/Auto choices
   clearly for independent play, with Prompt as the proposed onboarding default
   where supported. Explain unsupported target/map-dependent automations rather
   than appearing to run them. Preserve existing users' saved preferences and
   campaign policy when joining shared play.
3. **Optional personal encounter tools.** Add simple private opponent records
   (name, AC, HP, initiative) and manual target outcomes for users who want more
   automation. Full monster/map/DM management is not required for the first slice.

Implementation constraints: use explicit personal-versus-campaign encounter
scope and owner-only access; never emulate this by making a player a campaign
DM or creating a hidden campaign. Reuse pure domain rules and existing sheet
resource updates, keeping encounter orchestration outside the large sheet root.
Design durable resume and duplicate-click/multi-tab protection before enabling
turn effects; a reload must not reapply saves, damage or resets. Joining shared
combat requires an explicit handoff that prevents two encounter clocks from
mutating the same character. Personal mode must not advance shared combat,
expose hidden opponents or alter other players' sheets.

Acceptance: a character with no campaign can start, take actions, end/start
turns, receive appropriate prompts, rest and resume after reload. Verify resource
timing, concentration, death-save prompts, effect expiry, failed saves/retries,
duplicate actions, ownership isolation and shared-combat handoff. Show what
changed and offer safe corrections without silently reversing later edits.

### 2026-09-18 — Map navigation keys, v2.714

With the pointer over the unobstructed map, +/- (or =) zoom and 0 fits the
scene. Shortcuts reuse the existing camera actions and leave token data alone.
Typing, composition, browser modifier shortcuts, active pointer gestures and
overlays retain ownership of input. Leaving the map, cancelling a gesture or
losing window focus clears hover ownership; clicked toolbar buttons may retain
focus without blocking the camera keys. Instructions appear in Map controls.

Validation: release gate passed (875 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build, 252.4 KB entry). Six final desktop/mobile shortcut,
preset and control-reachability checks passed. Removing the overlay hit-test
fails the safety regression. Screenshots inspected; shared overflow probe found
no sideways scroll or new help clipping (existing underlying sidebar/map
findings remain). No database changes; user hands-on testing remains deferred.

### 2026-09-18 — Quick map zoom presets, v2.713

The zoom percentage is now a keyboard-accessible picker for 25%, 50%, 100%,
200% and 400%. Intermediate wheel/pinch/Fit values remain visible. Choosing a
preset or using +/- stops residual pan momentum, retains the world center and
respects the live zoom limits. Camera changes do not save scene or token data.
The compact native picker fits the desktop and mobile navigation dock.

Validation: release gate passed (871 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build, 252.4 KB entry). Desktop/mobile preset and Fit checks
passed, including camera center, token state, no scene writes and keyboard input.
All eight final desktop/mobile preset, control reachability, Find selection and
touch-pan checks passed.
Forcing all presets to 100% fails the regression. Screenshots inspected; shared
overflow probe found no sideways scrolling or dock clipping, with existing
underlying sidebar/map findings. User hands-on testing remains deferred.

### 2026-09-18 — Clearer map tool rail, v2.712

Tool buttons now share sharp SVG icons, accessible names, pressed-state semantics,
keyboard focus rings and an inset active marker. Eraser, clear drawings and clear
walls have distinct symbols. Existing descriptions, DM/player visibility,
tool handlers and destructive-action confirmations are preserved. Coarse-pointer
targets grow to 40px. No icon font or heavy dependency was added.

The scrolling rail measures the actual navigation dock above combat/dice controls,
so its lower tools no longer hide behind the mobile dock. Button rendering and
rail measurement moved into battlemap components, shrinking the map root by
over 270 lines. User hands-on testing remains deferred; no database changes.
Validation: release gate passed (871 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, production build, 252.4 KB entry). Four final desktop/mobile
tool and player-combat checks passed. Forcing pressed-state reporting off fails
the regression. Screenshots inspected; overflow probe found no sideways page
scroll or new tool clipping, with existing underlying sidebar/map findings.

### 2026-09-18 — Compact selection toolbar, v2.711

The selection toolbar starts compact: selection count, movement arrows, More and
Clear. Lock/Unlock, Hide/Reveal and Delete expand on demand in an inline panel.
Mobile keeps movement on a dedicated row, reducing the normal mixed-selection
toolbar from three rows to two. Expanded actions remain labelled buttons with
the existing deletion confirmation and save-failure feedback.

More exposes its expanded state and controlled panel to assistive technology.
Escape closes the panel and returns focus to More without clearing the selection;
changing the selected group closes it automatically. Hidden actions leave both
layout and keyboard navigation. User testing remains deferred; no database changes.
Validation: gate passed (871 unit tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build, 252.4 KB entry). All four desktop/mobile visibility
and group-drag checks passed; two final layout checks passed. Screenshots inspected.
Forcing hidden actions visible fails the new compact-state test. Overflow probe
reports no sideways page scroll or toolbar clipping; existing underlying
sidebar/map findings remain.

### 2026-09-18 — Reliable group token edits, v2.710

Group Hide/Reveal now targets only non-character tokens, matching its existing
tooltip promise. Group edits and deletions wait for each API confirmation before
changing local state, handle false results as well as exceptions, keep successful
changes on partial failure and explain what failed. Deletion failures also use
a toast so the message remains visible if fewer than two tokens remain selected.
An in-flight guard prevents overlapping batches and confirmation dialogs.

Both token backends now require a returned row for field updates and deletions;
RLS-filtered or missing rows cannot silently count as saved. Placement-backed
scenes still have no persisted lock field: group Lock/Unlock now explains that
limitation without making a local-only change. Adding placement lock persistence
remains a separate schema/gameplay task; this release has no migrations.

Tests cover mixed selections, pending saves, partial failures, rejected promises,
cancelled deletion, unsupported locks and zero-row API results. Removing the
character filter fails the regression. Browser checks inject an empty-row save,
verify unchanged tokens and then perform real local Hide/Reveal with cleanup.
User hands-on testing remains deferred.

The broader map regression also caught resize replacing v2.709's fitted zoom
floor and zooming mobile views inward. Resize now preserves the current scale.
Release gate passed: 870 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and 252.4 KB entry. Desktop/mobile visibility checks and the broader map
resize/navigation checks pass. The shared overflow probe reports no sideways
scrolling or new clipped controls; existing underlying sidebar/map findings remain.

### 2026-09-18 — Fit map clears controls, v2.709

Fit map now frames the full scene inside the space between the tool rail,
top controls and navigation dock. It shares bounds framing with Find selection.
Both lower the viewport zoom floor when needed, so the clamp no longer undoes
a fit on short landscape screens. Minus and pinch-out do not jump inward from
these smaller fitted views. Token coordinates and scene data are unchanged.

Pure geometry coverage checks scene corners, zoom caps and unavailable space.
Browser coverage checks all four scene edges against actual controls after
portrait/landscape resizing, zoom-button direction and unchanged token positions.
Removing clear-space framing fails the regression. Desktop and mobile screenshots
inspected. User hands-on testing remains deferred; no database changes.
Release gate passed (861 unit tests, TypeScript 221/221, hooks, RAW/coords/anchors,
build and 252.4 KB entry). The broad browser run passed 19/20 cases; the mobile
group-drag test now uses Find selection after its toolbar opens, and passes in
both viewports. Final targeted framing, zoom round-trip, group-drag and pinch
checks pass. Overflow probe finds no sideways scrolling or new clipped controls;
existing underlying sidebar/map clipping remains.

### 2026-09-18 — Live grid appearance, v2.708

The map controls menu now offers Classic, Light and Dark grid colors, opacity
from 0–100%, stronger five-cell lines and a reset button. Preferences survive
reload on this device and affect only that viewer. The existing classic style
is the default; hiding lines does not disable snapping. No database changes.

Restyling retains the existing Pixi grid object and layer order; opacity changes
only its alpha, avoiding geometry rebuilds. Removed the obsolete duplicate color
constants. Closed help panels explicitly hide their controls from layout.

Validation covers preference parsing, actual rendered stroke colors/alpha,
stable layer order, unchanged tokens and zero scene writes, reload persistence,
reset, and desktop/mobile panel bounds. Disabling the alpha binding makes the
new browser regression fail (expected 0.3, received 1). Screenshots inspected;
the shared overflow probe reports no sideways page scroll or new panel clipping,
with existing underlying sidebar/map clipping still reported. User testing deferred.
Release gate passed: 859 unit tests, seven runner tests, TypeScript 221/221,
hooks, RAW/coords/anchors, build and 252.4 KB entry. All 18 desktop/mobile map
gesture and player-combat browser checks passed, including landscape help.

### 2026-09-18 — Artwork preview and proportional sizing, v2.707

Upload Map now opens a local preview before any upload. Fit inside preserves the
whole image with transparent padding; Fill and crop covers the map with centred
cropping. Both preserve proportions and existing scene/grid/token coordinates.
A preview-only grid-opacity slider helps judge alignment and never changes
exported pixels. Enlargement feedback flags artwork that may look soft.

The prepared image is saved as WebP (quality 94), bounded to a 4096px edge and
approximately eight million pixels, within the existing 5 MB upload limit.
Animated inputs become still frames. Padding/crop is baked into the saved image,
so the existing renderer and older clients need no new schema or fit metadata;
existing artwork is unaffected. Live-map grid opacity followed in v2.708.

The scene path changes only after an update returns a row. A failed scene save
keeps the uploaded path for Retry; cancellation or changing the preparation
discards uncommitted uploads with best-effort storage cleanup. The map root lost
upload handlers and hidden-input/status wiring to the dedicated component.

Validation: release gate passed (855 unit tests, seven runner tests, TypeScript
221/221, hooks, RAW/coords/anchors, build and 252.4 KB entry). New browser coverage
checks preview pixels, fit/crop, grid opacity without baked lines, cancellation,
zero-row save rejection, retry without duplicate upload and actual stored-image
rendering. Swapping Fit to crop fails the pixel regression. The broader map test
had an outdated canvas-centre assertion from before v2.705; it now checks the
selected token clears controls. Overflow probe found no page-wide sideways
scroll; it still reports underlying sidebar/map/closed-help content, while the
new dialog has explicit viewport/radio sizing assertions. User testing deferred.
All four final desktop/mobile artwork and map checks passed; preview and applied
artwork screenshots inspected.

### 2026-09-17 — Token borders and overview labels, v2.706

Tokens now have a layered shadow and a separate highlighted rim above portraits;
the old shared fill/stroke could be covered by the portrait sprite. Selection
adds a cyan rim, and active-turn rings have a dark backing stroke for contrast
over bright artwork. Portrait aspect ratio, circle crop and footprint hit areas
are preserved. Shadows use simple geometry, without per-token blur filters.

Below 65% zoom, unselected/inactive names are hidden. Selected and active names
remain available with a capped size boost; death-name strikethrough tracks that
scale. HP, condition, lock, cover and movement indicators retain their existing
visibility/permission rules. Camera-driven detail changes reuse the existing
animation loop instead of writing React or shared state on zoom.

The synthetic wide-portrait browser fixture verifies border draw order, aspect
ratio, overview hiding, selected-name restoration/enlargement and zoom-in
restoration. It blocks service workers and uses Pixi's main-thread image loader
for deterministic interception; it does not certify production worker fetching.
User hands-on testing remains deferred. No database changes.

Validation: release gate passed (846 unit tests, seven runner tests, TypeScript
221/221, hooks, RAW/coords/anchors, production build, 252.4 KB entry). All 16
desktop/mobile gesture and player-combat checks passed; four focused visual
checks passed again after correcting a connecting stroke caught in screenshot
review. Final screenshots inspected. Disabling overview hiding makes the new
browser regression fail; restored behavior passes. No physical-device FPS claim.

### 2026-09-17 — Selection camera framing, v2.705

Find selection now frames the union of selected token footprints, zooming out
only when needed. It uses the space to the right of the tool rail, below the
selection actions and above navigation, with breathing room around the group.
It centres the bounds rather than averaging token centres, so clustered groups
and large creatures do not push outlying tokens offscreen. Existing comfortable
zoom is preserved. This changes only the local camera, never token positions.

The regression reproduced offscreen selection on desktop and mobile before the
fix. Screenshot review then caught toolbar overlap; the final assertions require
the full selection to clear the rail, selection actions and navigation dock.
Pure geometry tests cover wide/tall groups, even/odd footprints, asymmetric
controls, single-token zoom preservation and empty/unmeasured views.

User hands-on testing is explicitly deferred. Continue automated map/navigation
and appearance improvements without treating that deferred testing as a blocker.

Validation: release gate passed (840 unit tests, seven runner tests, TypeScript
221/221, hooks, RAW/coords/anchors, production build, 252.4 KB entry). Four focused
desktop/mobile browser checks passed, including selection bounds, unchanged
token data/no position writes, zoom readout, sharp rendering and control access.
Final screenshots inspected. No database changes.

### 2026-09-17 — Interrupted gestures and landscape combat help, v2.704

Pan now cancels on lost pointer capture and hidden-tab transitions. Escape
cancels an active pan before the fullscreen handler can close the map. Capture
ownership is cleared before release, preventing stale gestures and recursive
cancellation. A fresh gesture works immediately afterward. Normal pinch-to-one-
finger navigation is preserved; camera gestures do not change token positions.

Combat help previously extended above the viewport at 851×393. It now measures
the space above the dock and scrolls within that space. The bounds update when
the dock moves/resizes, and scroll does not chain out of the help panel.

Regression coverage exercises mouse and Chromium touch capture loss, Escape,
simulated hidden-tab cancellation, recovery, and landscape help bounds/scrolling.
The old capture behavior and old landscape layout both failed the new checks
before their fixes. Optional 4× CPU slowdown coverage and a physical-device
checklist are documented in e2e/README.md. Actual-device smoothness, Safari touch,
thermal behavior and real-session acceptance remain pending; emulation cannot
certify those. No database changes in this release.

Validation: release gate passed (834 unit tests, 221 carried TypeScript errors,
clean hooks/RAW/coordinate/anchor checks, production build and bundle budget).
All 18 desktop/mobile map browser checks passed; both interrupted-pan checks
also passed at 4× Chromium CPU slowdown. This verifies recovery, not frame rate.

### 2026-09-17 — Player movement for DM-created characters, v2.703

Players can now save position changes for their character's DM-created placement
without transferring combatant ownership. The new UPDATE policy requires the
linked character owner, current campaign membership, matching character/combatant/
scene campaigns, a published scene, and a visible token. A trigger limits this
new permission to x/y and updated_at; identity, scene, appearance, rotation,
lighting, and visibility cannot be changed through it. Existing DM and combatant
owner permissions are preserved; INSERT/DELETE are not expanded.

A non-exposed helper with pinned search_path avoids the combatant/placement RLS
recursion found in v2.654. Anonymous execution is revoked. The real local combat
test now succeeds with DM ownership unchanged, including turn order and movement
exhaustion. It retains rejected-save rollback using one simulated zero-row reply.
Direct database-role probes cover allowed movement and denied identity/metadata
changes, deletion/insertion, other characters, nonmembers, removed members,
unpublished/hidden scenes, detached characters, and non-character combatants.

This resolves the v2.701 ownership blocker. Combat turn/budget UI checks and the
existing movement logging are unchanged; this is not a new server-side combat
budget enforcement system. Next: physical-device smoothness/touch acceptance,
then further map appearance work. Fog/lighting remain last.

Verification: required gate passed (834 unit tests, seven runner tests,
TypeScript 221/221, hooks, RAW/coords/anchors, build, 252.4 KB entry). All 16
desktop/mobile map browser checks passed. Removing the new policy fails the
allowed-move probe; removing the trigger fails the metadata-denial probe.
Reapplying the migration restores both, confirming idempotency. Local security
advisors report only the existing keep_warm search-path and client_errors INSERT
warnings; neither concerns the new private functions or policy.

### 2026-09-17 — Map presentation and high-density rendering, v2.702

The map now renders at display density, capped at 2x and an eight-million-pixel
budget above native resolution. CSS dimensions and world/pointer coordinates
remain unchanged. Token glyphs use 2x textures; names wrap within their token's
width rather than running into adjacent names. Uploaded low-resolution artwork
is not upscaled into new detail.

Navigation now has consistent SVG icons, a clearer active mode, restrained
surfaces, and a dedicated mobile layout. The permanent idle instruction overlay
is replaced by compact, keyboard-accessible help; active-tool instructions remain.
Help closes on Escape or an outside click. Reduced-motion preferences are honored.

The v2.701 player-combat ownership blocker remains open. This is a presentation
pass, not a change to database permissions. Physical-device performance and touch
acceptance remain open; headless browser checks are not a real-device FPS claim.

Verification: 834 unit tests, seven runner tests, TypeScript 221/221, hooks,
RAW/coords/anchors, build and 252.4 KB entry passed. All 16 map browser checks
passed; final desktop/mobile close-ups also passed token-width, density, and
control hit-testing checks. Forcing density back to 1 makes the mobile regression
fail. Screenshots inspected. The generic overflow probe reports sidebar text
truncation and underlying campaign containers behind fullscreen; the fullscreen
dock has separate viewport-bound and occlusion assertions, which pass.

### 2026-09-17 — Visible history and player movement safeguards, v2.701

Undo and Redo now share the map navigation bar, show their action labels, and
disable while saving. Player fullscreen now fills the viewport; navigation
clears the combat strip and raised dice buttons on desktop and mobile.

Position saves now require a returned row. Previously an RLS-denied update could
look successful, leaving a ghost move and spending movement. Failed player drags
now restore the token, show an error, and preserve the movement allowance.

**Next release blocker:** the newer engine gives DM-created player-character
combatants DM ownership, while placement UPDATE requires combatant ownership.
The player can select their character but cannot save its move. This release
handles that denial honestly; it does not change database permissions. Fix the
narrow movement permission without granting character owners unrelated combatant
creation/deletion powers, and test a DM-created PC without changing fixture ownership.

The new local two-account combat regression covers denied saves, turn order,
other-character restrictions, and movement exhaustion. Its successful-save case
explicitly assigns the fixture combatant to the player; that is not evidence
that ordinary DM-created PC ownership is fixed. Physical-device touch remains
open. Appearance/clearer controls follow movement; fog/lighting remain last.

Verification: 830 unit tests, seven runner tests, TypeScript 221/221, clean hooks,
RAW/coordinate/anchor checks, production build and 252.4 KB entry. All 14 local
map browser checks passed; all eight affected movement/gesture checks passed
again after the final dice-button clearance fix. Desktop/mobile screenshots
inspected, with explicit fullscreen and control-separation assertions.
Disabling Redo, denied-save detection, or control clearance individually makes
the corresponding browser regression fail; all three fixes were restored.

### 2026-09-17 — Group dragging and move controls, v2.700

DMs can drag a selected group outside combat, preserving its formation and
complete footprints at map edges. Escape, pointer cancellation, and blur restore
the group. Successful saves form one undo action; failed members roll back.
The selection bar now has four one-cell movement buttons on desktop and mobile.
Pan mode takes priority over selected tokens. Combat keeps the existing
single-creature movement path. Group saves remain sequential, not atomic.

Two-account testing exposed a pre-existing Presence limit: repeated start/end
updates disconnect the drag channel. Connection membership now uses Presence;
short-lived Broadcast leases carry held token IDs, renew while dragging, clear
on release/disconnect, and expire after a lost release (within eight seconds).
This also fixes rapid single-token selection breaking subsequent live movement.
The map root shrank by 83 lines as sharing moved into its own hook.

Verification: 825 unit tests, seven runner tests, TypeScript 221/221, clean hooks,
RAW/coordinate/anchor checks, production build and 252.4 KB entry. Desktop/mobile
local multiplayer checks cover group cancellation, locks, undo/redo, visible
movement buttons, reconnect, and Pan priority. All 12 map browser checks passed.
Screenshots inspected; disabling group dragging makes the new regression fail.

Next: visible redo controls and player combat movement acceptance, followed by
map appearance/clearer controls. Physical-device touch remains open. Fog last.

### 2026-09-17 — Group nudge history and reconnect, v2.699

DM arrow-key group moves outside combat now record one undo, preserve the
formation at map edges using complete token footprints, and refuse held tokens.
Position saves are checked; a partial failure records only successful moves.
Token undo/redo checks for newer positions and held tokens before saving, retries
only unfinished members after a partial failure, and leaves failed history
available. Repeated undo shortcuts cannot overlap requests. Failures show a toast.
These are client conflict checks, not an atomic multiplayer transaction.

Rejoining the token subscription fetches current positions missed while offline.
Responses from old scenes or superseded reconnects are ignored; a held local
preview is preserved. A two-account browser regression disconnects a player,
moves two selected tokens, reconnects, then exercises group undo/redo and restores
their positions. Removing reconnect refresh makes that regression fail.

Verification: 817 unit tests (16 new), seven runner tests, TypeScript 221/221,
clean hooks and production build, 252.4 KB entry. Twelve real-local-DB browser
checks passed across desktop/mobile, including the two-account reconnect test;
screenshots inspected. Physical-device and player-combat acceptance remain open.
The mobile selection toolbar now sits below the header, beside the tool rail;
desktop/mobile rechecks pass and restoring its old top position fails the new
layout assertion.

Next: pointer-based group dragging, visible/mobile group-move and redo controls,
player combat movement acceptance, then appearance/controls. Fog remains last.

### 2026-09-17 — Touch and shared token gestures, v2.698

Pan mode now supports two-finger pinch anchored under the midpoint and returns
smoothly to one-finger panning. Token drags belong to the pointer that started
them: another pointer cannot move or drop the held token. Escape, pointer
cancellation and window blur restore the origin and release the shared lock;
Escape cancels the gesture before closing fullscreen. Cancelled previews do not
write a position to the database.

Two-account testing exposed stale drag locks in realtime-js 2.103.3: its presence
adapter mutated Phoenix metadata, retaining old held-token entries after release.
Pin realtime-js to 2.116.0 through an npm override, while keeping supabase-js at
the previously locked 2.103.3. The wider SDK upgrade changed unrelated database
typing; it is deferred. Remove the override when upgrading the parent SDK to a
version containing the presence fix.
The fixed realtime client requires Node 22+; CI and the package engine now
declare that minimum (this machine runs Node 24).

Local desktop/mobile regressions exercise DM-to-player live movement, snapped
position saves and return moves, cancellation on both accounts, lock release,
unrelated pointers, and native Chromium touch pinch/pan. Physical-device touch,
player movement during combat, group movement/undo, and reconnect acceptance
remain the next token-handling batch. Appearance/controls and fog follow that.

Release gate: 801 unit tests, seven runner tests, TypeScript 221/221,
clean hooks, RAW/coordinate/anchor checks, production build and 252.4 KB entry.
Removing Escape cancellation or pinch zoom makes the new browser regressions
fail; desktop and mobile screenshots were inspected.
All ten local map browser checks passed together: navigation, manual fog,
wall controls, two-account token movement and touch gestures, at both sizes.

### 2026-09-17 — Map experience, v2.697

Jared's priority order: (1) navigation and token handling, (2) appearance and
clear controls, (3) fog and lighting. Roll20 is the interaction reference;
parity is a multi-batch effort, not a claim about this release.

Navigation foundation implemented: explicit Select/Pan modes, temporary
Space-drag, live zoom percentage, Fit map and Find selection (including correct
large-token centers). Panning starts over tokens without moving/selecting them.
Canvas sizing now initializes after scenes load; resizing/fullscreen preserves
the live viewport and camera. Small maps can be panned freely. Scene controls
wrap on narrow screens and the tool rail scrolls rather than disappearing below
the map. The local fixture now handles the beta character cap transactionally.

Next acceptance batches, in order:
- Token handling: test group selection/movement, snapping, undo, touch gestures,
  ownership/locks and reconnect behavior with DM and player side by side.
- Appearance/controls: consolidate the tool palette, readable token names and
  state indicators, useful empty/upload flows, and unobstructed mobile controls.
- Fog/lighting: verify DM preview matches player visibility, then improve wall
  authoring and lighting feedback. Preserve existing visibility permissions.

Verification: full gate passed (801 unit tests, seven runner tests, 221/221
TypeScript baseline, clean hooks, build and 252.4 KB entry). Six real-local-DB
browser tests passed across desktop/mobile viewports: camera/navigation, wall
controls and manual fog. Restoring the old resize behavior makes the camera
identity regression fail. Screenshots and navigation bounds were checked.
Scene settings now scroll within the screen and render above mobile navigation
and dice controls; the existing fog test exercises Save successfully on mobile.
Actual touchscreen gestures and two-account movement remain in the next batch.

### 2026-09-16 — Release readiness

The next milestone is the invite-only, no-store beta defined in `betaMode.ts`.
Ordered action items, solutions and acceptance criteria:
[RELEASE_READINESS.md](RELEASE_READINESS.md). Start with a shared local/CI gate
(`npm run verify`), then finish save/draft validation, auth recovery, database
certification and a two-account playthrough before release.

Account recovery implemented: profile reads stop loading after 12 seconds;
late results cannot restore another account's profile or grants. Settings keeps
sign-out reachable without a profile and offers retry after failure. Eight new
mocked regressions plus desktop/mobile recovery-panel checks; live auth and
multiplayer acceptance remain open in the release checklist.
**Current version:** v2.665.0

### 2026-09-10 — User-experience foundation, v2.695.0 (local; not deployed)

First implementation batch from Jared's user-first product review:
- Character-sheet saves now serialize/drain partial changes and retain failed
  patches for explicit retry. The queue survives route changes; a cross-page
  notice links back to failed saves. Pending changes trigger the browser's
  supported before-unload warning. This is not durable offline combat storage.
- Character creation saves an account-scoped, versioned draft on this device,
  with Resume/Discard, storage-failure feedback and cleanup after creation.
- Mobile New goes to the existing character creator route.
- Landing page describes current beta allowances instead of an unavailable shop.
- Unit test discovery is scoped to src/ to avoid collecting nested worktrees.

Verification and next UX priorities: [USER_EXPERIENCE.md](USER_EXPERIENCE.md).

This document is the durable map for DNDKeep's development. It exists so that
progress can continue across sessions without re-deriving context, and so the
parallel efforts don't drift into each other's risk budgets.

> **2026-08-12 — Track 3 was retired.** The roadmap ran three tracks until the
> separate Roll20-caliber mini-app was killed and its goals folded into Track 2.
> See [Track 3 — retired](#track-3--retired-2026-08-12) for the reasoning.

---

## The core principle: two tracks, two risk profiles

DNDKeep's development is split into two tracks that deliberately do **not**
compete for the same risk budget. Each has its own cadence and its own tolerance
for breakage.

| Track | What | Risk profile | Cadence |
|-------|------|--------------|---------|
| **1 — RAW accuracy + automation** | Correctness of rules data; detection/verification automation | Low tolerance for silent error. Human-gated. | Gated sessions when real RAW work exists |
| **2 — The map** | Evolve the production map toward Roll20 parity; keep + improve automations | Production, so gated — but engineering, not rules-judgment | Daily default; small visible ships |

The split is by **kind of judgment**, not by feature area. Track 1 is rules
judgment, where a silent error is a wrong number in someone's game and no test
catches it — so a human decides every edit. Track 2 is engineering, where the
gate (tsc, build, tests, hooks) actually catches regressions, so iteration can
move fast. Keeping them apart stops map velocity from leaking into rules data.

---

## Track 1 — RAW accuracy + automation

**Goal:** Get the site as automated and as close to 2024 D&D rules as possible,
using only official content. No invented spells, monsters, or mechanics.

### Content scope rule (LOCKED — Interpretation B, hardened v2.552)

- **Canonical source:** SRD 5.2.1 (CC-BY-4.0) is the canonical verbatim source.
  Where an entry exists in SRD 5.2.1, its rules text should match the SRD
  **exactly** — audits verify against the SRD PDF, not third-party wikis
  (wikis are used only for cross-checking non-SRD mechanics).
- **Mechanics:** Full 2024 rules implemented. Numbers, scaling, and rules behavior
  are not copyrightable and may be implemented in full (2024 PHB / MM / DMG).
- **Verbatim text:** Descriptive/flavor text may be reproduced verbatim **only**
  for SRD 5.2.1 / 5.1 content (licensed CC-BY-4.0). Non-SRD content gets full
  mechanical support with **paraphrased or original** descriptions — never
  copied PHB prose.
- **Attribution:** The `/srd` page carries the exact SRD 5.2.1 and SRD 5.1
  attribution statements required by CC-BY-4.0. This must remain reachable
  from the app at all times.
- **Source tagging (rolling):** As entries are audited, tag them
  `srd-5.2` / `srd-5.1` / `paraphrase` / `legacy` / `homebrew` so compliance
  is machine-checkable. New content added going forward must be tagged.
- **Official only:** No invented spells, monsters, subclasses, feats, or mechanics.
  Every entry traces to an official WotC source.
- **Legacy sources:** Where no 2024 version exists (e.g. Artificer = TCE), the
  pre-2024 official version is allowed, tagged as legacy, refreshed when WotC
  publishes a 2024 replacement.
- **Psion:** Private homebrew (UA-derived), RLS-scoped to the owner's account,
  **excluded** from all RAW audits and the regression suite. Not shipped to
  standard players.

> **Legal note:** The above is a product/accuracy posture, not legal advice.
> Claude is not a lawyer. Before a commercial launch, a real IP attorney should
> review the licensing posture (SRD CC-BY-4.0 attribution requirements, the
> mechanics-vs-expression line).

### Automation posture (LOCKED)

Track 1 automation is **detection and verification only** — never unattended
editing of rules data.

- **Safe to automate:** regression suite that asserts known-good RAW values,
  CI gate, duplicate/consistency scanners, drift detection that opens issues.
- **Human-gated:** every actual edit to rules data. Claude verifies against
  official sources; the human makes the judgment call; ships are gated deltas.
- **Never:** a cron that finds, edits, verifies, and auto-merges RAW data with no
  human in the loop. This compounds silent errors into production and is
  explicitly out of bounds. (See RAW_AUDIT_2024.md: errors compound.)

### Backlog (from RAW_AUDIT_2024.md sequence)

Shipped: v2.547 (quick wins #4/#12/#18/#21), v2.548 (spell cleanup S3/S4/S6/S7/S10).

Outstanding:
- **Description corrections:** #2 Divine Spark, #3 Relentless Rage, #9 Druid Wild
  Shape temp HP, #11 War Magic, #14/#15 Berserker.
- **Scaling tables (QC carefully):** #1 Cleric CD (L18 not L11), #5 Paladin CD.
- **Feat rewrites:** #6 Lucky, #7 Alert, #8 Skilled, #17 Tavern Brawler.
- **Save-DC architecture:** #10 Intimidating Presence (class-DC SaveSpec).
- **Additive spell content:** S1 Divine Smite, S2 the 11 missing 2024 PHB spells.
- **Artificer backfill:** S8 (~80 spell class-list additions), legacy-tagged.
- **Playtest hygiene:** strip Psion-UA spells from non-Psion class lists.
- **Regression suite:** encode all corrected values as assertions (see Track 0).

### Character size selection (queued — v2.652 dependency)

**Ask:** let a player choose their character's size where the 2024 species
permits it, and have that choice feed the cover rules that landed in v2.652.

**Why it's blocked on nothing but time:** `src/rules/cover.ts` already gates
creature cover on size (`creatureCoverContribution`, `CREATURE_COVER_MAX_SIZE_GAP`)
and the whole path reads a size label end to end. Today that label always comes
from the token, which defaults to `medium` — so the gate is real but nobody can
move it. This work is what makes the choice matter.

Scope:
- **Data:** `SpeciesData.size` is a single `CreatureSize` (`src/data/species.ts` —
  currently 12 × Medium, 2 × Small). 2024 PHB lets **Aasimar, Human and Tiefling**
  pick Small *or* Medium. Widen the field to allow a choice set, leaving fixed-size
  species as they are.
- **Character:** no `size` column exists on `characters`. Add one (idempotent
  migration), defaulting to the species' fixed size so every existing character is
  unchanged.
- **Creation + settings UI:** a size picker that only appears for species offering
  a choice; validate the pick against that species' allowed set on write.
- **Token:** PC tokens hardcode `size: 'medium'` (`BattleMapV2.tsx` ~L1634) — derive
  from the character instead, so a Small character occupies a Small token and gets
  the cover treatment their size earns. (v2.657 did this via the species seam in
  `CampaignDashboard`; the remaining piece is the per-character override.)
- **Not in scope: drawing Small tokens smaller.** Settled 2026-08-12 — Small and
  Medium occupy the same 5-ft space in the 2024 rules, so they render
  identically. See the Track 2 note.
- **Knock-ons to check:** carrying capacity (Powerful Build already counts as one
  size larger), Halfling Nimbleness ("move through the space of a creature one size
  larger"), grapple/shove size limits, and Naturally Stealthy.

### Choice pickers: show the full text, always — **shipped v2.670 + v2.671** (complete)

**Ask (Jared, from the Psionic Disciplines picker):** every description should be
expanded by default, and the **Less** button should go entirely. You are choosing
between mechanics you have to compare — you read all of them, every time — so
truncation is pure friction.

**Where:** `src/components/CharacterSheet/PendingChoicesAlert.tsx` (~L221-230). The
row renders `{isExpanded ? 'Less' : 'More'}` against `expandedDisc`, which holds a
**single** id — so opening one description collapses the previous one. That is the
real cost: comparing two disciplines is impossible without toggling back and forth
between them.

Scope:
- Drop the `expandedDisc` state and the toggle button; render `disc.description`
  in full on every row. Deleting state is the whole fix — no "expand all" control,
  which would just be the same friction with an extra click.
- Check the surrounding scroll container still reads well once every row is tall:
  the list is inside a fixed-height scroller, and full text on ~10 disciplines
  makes it much longer. If it gets unwieldy the answer is a taller panel, not
  re-truncating.
- **Apply the same rule to the other choice pickers, not just disciplines.** Same
  file handles the other pending-choice types; whatever else truncates a mechanic
  the player is choosing between should stop. Audit before changing, so this lands
  as one consistent rule rather than a one-off.
- `DMlobby.tsx:97` has the same `More`/`Less` pattern — **out of scope**, and worth
  saying why: that one expands a campaign blurb you are reading, not comparing.
  Truncation is reasonable there. This rule is about *choosing*, not *reading*.

**What shipped (v2.670):** both Psionic Discipline pickers —
`PendingChoicesAlert.tsx` and `LevelUpWizard.tsx`'s `DisciplineStep`. Expand state
and the More/Less (▼/▲) buttons are gone, every row renders the full description,
and both scrollers went `300`/`360px` → `min(60vh, 520px)` rather than re-truncating.
Verified in a browser at 1280 and 393px.

Two traps the wizard hit, worth knowing before the remaining pickers are done:
`globals.css` sets `white-space: nowrap; overflow: hidden` on **every** `button`, so
a description moved inside one is silently clipped to a single cut-off line — the
text must sit outside the button. And a `flex-direction: column` list with a
max-height shrinks its rows by default, squashing full-length descriptions into each
other until the rows get `flex-shrink: 0`.

**What shipped (v2.671):** the feat and spell pickers, closing the rule out. The
audit had found no second picker left in `PendingChoicesAlert.tsx` — the
cantrip/spell prompts moved to `SpellCompletionBanner`, which doesn't truncate — so
the remaining friction was in three shared/creation surfaces, all of which lost
their expand state:
- `LevelUp.tsx` `FeatCard` — was `slice(0,100)` + a per-card ▼; now full
  description and benefits on every card, list `320px` → `min(60vh, 520px)`.
- `shared/FeatPicker.tsx` — was a one-line CSS ellipsis + a single `expanded` id
  with expanding coupled to selecting; now every row carries its full description,
  prerequisites, ASI and benefits, and a row click just selects. The duplicated
  description inside the old expanded block is gone. Serves CharacterCreator's
  StepBuild and LevelUpWizard.
- `shared/SpellPickerDropdown.tsx` — description and stat line always shown; the
  row is no longer a clickable expander (Add/Remove is the only action) and the
  duplicate Add/Remove pair that lived in the expanded block went with it.

Both `LevelUp`'s feat list and the earlier discipline lists hit the same
`flex-shrink` trap noted above — worth assuming it applies to any list of this
shape. Verified in a browser at 1280 and 393px.

Deliberately left truncated, both being *reading* not *choosing*: `DMlobby.tsx:97`
(campaign blurb) and `FeatPicker`'s closed trigger, which summarises the feat you
already picked.

---

## Track 2 — The map (daily iteration)

**Goal:** Evolve the production map toward Roll20 parity, in place, one gated
ship at a time. It starts graphically minimal (import a picture for
token/background) but carries all current automations. Keep the automations,
improve them, add capability.

Since Track 3 was retired (2026-08-12) this is the *only* map track: there is no
separate graphics-rich app to defer ambitious features into. Anything that would
once have been "Track 3 work" is now a Track 2 backlog item that has to earn its
way through the normal gate. The parity tiers are listed under
[Roll20 parity](#roll20-parity-inherited-from-track-3) below.

**What exists today:** PixiJS canvas, token placement (`scene_token_placements`),
`combatants` source-of-truth, SAT-based AOE footprint hit-testing, cone/line
geometry, 8-way direction snapping, reach visualization, concentration indicator,
action-economy ring, condition/immunity systems.

**Risk:** Production, so the gate applies (tsc ≤ the carried baseline —
see `TS_BASELINE` in `.github/workflows/ci.yml` for the current number — / TS2304 = 0,
rules-of-hooks clean, vite build). But this is engineering, not rules-judgment, so
iteration can move faster than Track 1.

**Candidate backlog (to be prioritized):**
- **Cover from walls — shipped in v2.661.** `wall_type` is no longer dead code:
  `scene_walls.wall_type` stores the material, a picker in the wall toolbar
  (`battlemap/WallTypePanel.tsx`) sets it for new walls, ctrl+click retypes an
  existing one, and `coverWalls` in `battlemap/coverState.ts` resolves it onto
  `CoverWall.type`. Closed doors now score as doors (total cover) instead of
  half, derived from `doorState` rather than stored twice.
  - **Existing walls were deliberately NOT backfilled.** They stay NULL and keep
    scoring as legacy untyped (half cover each). Converting them to solid would
    be the "correct" reading, but it silently upgrades every wall on every live
    map to total cover mid-campaign — a gameplay change, not a migration. The
    opt-in `update` is in the migration's header comment. **Live maps therefore
    see no change until a DM opts in or redraws.**
  - Not verified in a browser yet — Docker was down when it shipped, so the
    toolbar and the three wall colours have only been checked by unit test and
    build. Worth a look on next run.
- **Terrain objects — deliberately deferred (2026-08-12).** Crates, pillars,
  boulders as a cover source. Jared's call: *walls only for now* — get walls
  plus fog of war genuinely solid before widening the surface. When it is
  picked up, the choice is typed low walls (which would now reuse the whole
  v2.661 pipeline for free) versus a first-class object entity with its own
  cover level; `combineCover` already takes a third blocker source either way.
- **Walls + fog of war is the current focus.** Sequenced deliberately, since
  the wall system and the lighting system are the same system viewed twice —
  a wall's material has to answer both "how much cover" and "can you see
  through it".
  - ~~Materials drive line of sight~~ — **shipped v2.662.** Windows and low
    walls transmit sight while still granting ¾ and half cover; solid walls
    and shut doors block. Before this every wall was opaque to vision, so an
    arrow slit fogged a room exactly like a stone wall.
  - ~~Per-character vision range (the v2.226 TODO)~~ — **shipped v2.663.**
    Sight range is `sightRadiusFt` (`src/rules/vision.ts`): unlimited in
    bright and dim (lightly obscured is disadvantage, not a distance cap),
    and in the dark the better of the creature's darkvision and its own
    light. Darkvision is resolved from the species table at the same
    `CampaignDashboard` seam that resolves token size.
  - ~~Light sources~~ — **shipped v2.663, completed v2.665.** v2.663 put
    `light_radius_ft` on a token (None / Candle / Torch / Lantern /
    Daylight in the context menu), because darkvision alone would have
    left every Human blind the moment a scene went Dark. v2.665 made any
    token carrying a light actually *emit* it, so a token named "Brazier"
    lights the room — no `scene_lights` table, because a light source is
    a thing at a position that can be placed, moved, hidden and synced,
    which is the definition of a token.
    - Emission is gated on a PC having line of sight to the source, or a
      brazier would light its room for the party from anywhere on the
      map. The gate tests the source's centre point, so light spilling
      around a corner from a lamp you cannot see is not shown — the
      error is conservative (hides light, never reveals a dark room).
      Fixing it properly means intersecting visibility polygons per
      (viewer, light) pair.
    - ~~Separate bright/dim bands~~ — **shipped v2.666.** The fog is no
      longer binary: a light erases its bright band completely and its
      dim band most of the way, leaving a murk. `lightBandsFt` halves
      the stored total, which is exact for all four presets (every RAW
      light sheds dim for as far again as it sheds bright), so no
      migration was needed — the information was always in the column.
      - **Darkvision now reads as DIM, not bright**, per RAW: within the
        radius you treat darkness as dim light. The visible change is
        that a Dwarf's 60 ft is murky rather than daylight-clear.
      - The dim tier composites through its own RenderTexture. 'erase'
        multiplies, so drawing dim discs straight onto the fog would
        compound where they overlap and four Dwarves standing together
        would out-shine a torch. Flattening the union first makes
        overlap idempotent — two candles do not make bright light.
      - Fixed in passing: the Candle preset stored 20 ft while its own
        hint said 5 + 5. A candle lit as far as a torch's bright band.
        Invisible while the fog was binary; obvious once bands drew.
    - ~~Coloured light~~ — **shipped v2.668.** `light_color` (0xRRGGBB,
      NULL = untinted) on BOTH token tables with a mirror trigger, same
      shape as v2.663; six named swatches in the token context menu,
      offered only once a token actually carries a light.
      - Rendered as an additive polygon in a container BENEATH the fog
        sprite. It cannot go in the fog texture — that texture is an
        alpha mask being erased, so colour painted where alpha reached 0
        is invisible by construction. Under the fog is also what makes a
        second visibility gate unnecessary: tint in an unseen region is
        covered by opaque fog and tint in a dim region shows through at
        the dim tier's residual alpha, so it grades itself.
      - **Masked to the world rect.** A light near the edge throws a
        polygon past the map, and out there is no fog to attenuate it —
        first attempt smeared bright orange across the empty page.
      - **The DM does not see the tint in normal DM view**, because
        VisionLayer does not mount at all when fog is off. Consistent
        with the DM seeing no fog either, and Player View previews it.
        Worth revisiting only if setting mood without toggling preview
        turns out to matter at the table.
  - ~~Manual fog~~ — **shipped v2.664.** `scenes.fog_mode` picks per scene
    between `dynamic` (line of sight, the v2.224–v2.663 behaviour, still
    the default) and `manual` (the DM paints reveals with the ☁ brush and
    they stay revealed). Switching modes does not clear the painting, so
    a DM can flip to dynamic for a fight and back. Reveals are grid cells
    in `scenes.revealed_cells`, one write per stroke rather than per
    pointer-move.
    - ~~Rectangle reveal~~ — **shipped v2.667.** A Brush/Rect toggle in
      `FogBrushPanel`; Rect drags one diagonal and applies on release,
      previewing the rectangle live while the drag chooses its far
      corner. Most map features are rectangular rooms, which the round
      brush could only approximate by scrubbing the corners and still
      catching a cell of the corridor outside.
      - Size buttons are hidden rather than disabled in Rect mode — the
        drag *is* the size, and a visible-but-inert control reads as
        broken.
      - **No lasso.** A freeform polygon would be a third interaction
        for a case the freehand brush already covers; rect handles the
        regular shapes, brush the irregular ones. Revisit only if a
        real map wants a shape neither can express.
    - ~~"Reveal what the party has already seen"~~ — **shipped v2.669
      as `fog_mode = 'remembered'`**, the third mode. What the party can
      see right now renders exactly as `dynamic`; everywhere they have
      been keeps its WALL LAYOUT drawn over otherwise-solid fog, like a
      dungeon-crawler automap.
      - **Contents stay hidden, by construction.** The fog over a
        remembered cell is never erased even slightly. Tokens render
        BENEATH the fog, so any erase at all would leak a monster
        standing in a room the party walked out of; structure is drawn
        ON TOP instead. You remember the room, not its occupants.
      - **Players explore, not just the DM** — moving your own token
        uncovers the map. Players have no UPDATE on scenes and must not
        get one, so this goes through `explore_scene_cells`, a SECURITY
        DEFINER function that checks campaign membership and can only
        ever UNION cells in. Verified: a seeded player's cell lands, a
        non-member is refused, `anon` is refused at the grant, and a
        repeat call does not change the count.
      - `explored_cells` is a SEPARATE column from `revealed_cells`.
        Merging them would overwrite the DM's hand-painted manual fog
        the first time anyone switched modes. Remembered mode renders
        the union, and the ☁ brush stays available in it so a DM can
        still mark "they were told about this wing" by hand.
      - Writes are batched (1.2 s) — the recompute fires on every token
        move, and a write per step is a write per footfall. Memory is
        add-only, so a dropped batch costs nothing: the next recompute
        sends those cells again.
      - **Accumulation needs someone watching.** It happens on any
        client rendering fog — every player, and the DM in Player View.
        A token moved while no player is connected AND the DM has
        preview off records only where it ended up, not the corridor it
        crossed. At a live table that does not arise; if it ever does,
        the fix is letting the DM's client compute without rendering.
  - **Per-player fog** is still party-shared (the v2.225 note in `VisionLayer`).
    Matches Roll20/Foundry defaults, so this is a preference rather than a bug —
    revisit only if a table wants split parties to see separately.
- **Pointer group-drag (deferred from v2.653).** Multi-select shipped with
  marquee sweep, shift-click, a bulk action bar (lock / hide / reveal / delete)
  and arrow-key nudge — but dragging a whole selection with the mouse was left
  out on purpose. TokenLayer's drag path enforces per-creature movement budgets,
  wall collision, remote drag locks and the active-turn gate; "move six tokens
  at once" has no honest answer during combat (six separate budgets), and
  bolting a bulk path onto that pipeline risks the single-token drag everyone
  relies on. Arrow-key nudge covers aligning a cluster out of combat. Do this
  properly when the drag pipeline is next refactored, not before.
- ~~**RLS recursion on `scene_token_placements`**~~ — **fixed in v2.654.**
  `stp_player_update_owned_combatant` (v2.616) subqueried `combatants` while
  `combatants_player_select_via_placement` (v2.309) subqueried placements right
  back; Postgres evaluates all permissive policies, so every placement UPDATE
  died with 42P17. Resolved with a `SECURITY DEFINER` ownership helper so the
  placement policies stop re-entering combatants' policies. Left here as a note
  because the failure mode (mutually-recursive permissive policies) is easy to
  reintroduce the next time a policy subqueries across these two tables.
- Grid tooling: square/hex, adjustable size, snap-to-grid.
- Measurement/ruler in grid units.
- Basic drawing primitives (shapes, freehand) if they serve automation.
- Automation improvements surfaced from live play.
- ~~Should Small tokens render smaller?~~ **Settled 2026-08-12: no.** A Small
  creature and a Medium creature both occupy a 5-by-5-ft space in the 2024
  rules — size only changes the occupied area at Large and above (Tiny is the
  exception below Medium, taking 2½ ft, and `tokenRadiusForSize` already draws
  it at `0.5` for distinction). Drawing Small smaller would imply a mechanical
  difference that does not exist, and would shrink every Small monster as a
  side effect. Small and Medium stay identical at `0.95`.

### Roll20 parity (inherited from Track 3)

Folded in when Track 3 was retired. Roughly ordered by dependency; each is a
normal Track 2 item now, shipped through the gate against the live map.

1. **Canvas & navigation** (pan/zoom, pages) — partially have via PixiJS.
2. **Layers** (map / object / GM-hidden / lighting) — foundational; several
   items below assume it.
3. **Drawing tools** (pen, shapes, text, color/opacity) — partially have.
4. **Grid** (square/hex, snap, per-page scale) — see grid tooling above.
5. **Tokens**: art library, resize/rotate, status markers, bars, auras, sheet
   link. Status markers, bars and sheet link already exist.
6. **Measurement** (ruler, movement tracking) — movement tracking exists.
7. **Fog of war / dynamic lighting** — highest complexity and risk; depends on
   the wall-drawing tools. Manual fog of war is the cheaper first step. **Do
   not lead with this.**
8. **Asset / art library + uploads.**

**Sequencing note (carried over):** dynamic lighting is the "wow" but also the
hardest and riskiest — occlusion geometry, wall performance, per-token vision.
The layers + drawing + grid foundation underneath it is lower-risk, higher daily
value, and lighting depends on it. Build the foundation first.

---

## Track 3 — retired (2026-08-12)

**Was:** build a Roll20-caliber, graphics-intensive map as a separate mini-app,
in isolation, designed to import into the live site later.

**Decision: killed. Evolve the live map instead.** Its target feature set moved
into Track 2 under [Roll20 parity](#roll20-parity-inherited-from-track-3).

**Why.** The quarantine that justified a separate app was also its main cost. A
second app only carries "the same automations" if the automation layer is
genuinely shared, which made Track 0 a *hard* prerequisite — so nothing
graphics-rich could ship until an extraction with no user-visible payoff was
finished first. And the isolation that made aggressive iteration safe is the
same thing that kept the results away from real play: a feature is only proven
once a real session uses it. Meanwhile Track 2 kept absorbing the parity list
anyway — PixiJS canvas, drawing, walls, vision, multi-select and cover all
landed on the live map, which is most of tiers 1–6.

**What this costs.** Real, and worth naming: the live map is production, so
every parity feature now pays the gate and there is nowhere to prototype
recklessly. Fog of war and dynamic lighting — tier 7, the riskiest work — have
to land incrementally behind the existing map rather than arriving finished.
That is the accepted trade.

**If this is ever revisited,** the reason to reopen it would be a specific
feature that genuinely cannot be built incrementally against the live map.
Nothing on the parity list currently looks like that.

---

## Track 0 — Shared foundation

**Not a separate goal — enabling work the map depends on.**

**Status note (2026-08-12):** this was a *hard* prerequisite when Track 3
existed, because two separate apps could not otherwise share automation logic.
With one map, it is no longer blocking — but it is still worth doing on its own
merits, and the argument is now about testability rather than code-sharing.

**The decoupling requirement:** the automation/geometry logic should be
**renderer-agnostic** — operating on abstract coordinates + state rather than
reaching into PixiJS. The map becomes a *renderer* on top of an automation core.

- Get this right → automation is unit-testable without a canvas, and the
  rendering layer can be replaced or upgraded without touching rules behavior.
- Get it wrong → geometry logic stays welded to display objects, and the only
  way to test it is to boot a browser.

This is already partly true and trending the right way: `src/rules/` is pure by
construction, and the battle-map decomposition keeps pulling logic out into
testable modules (`battlemap/marqueeGeometry.ts`, `battlemap/coverState.ts`,
`lib/map/coords.ts`). Continue that direction rather than attempting one big
extraction.

> **Practical constraint:** a test that imports a battle-map component passes
> locally and fails in CI. `ci.yml` pins `node-version: 20`, which has no global
> `navigator`; pixi.js reads it at module scope, and Node 21+ locally hides the
> problem. This is the concrete reason to keep pure logic in its own module.

---

## Deferred polish — paid dice cosmetics

**Owner note, 2026-08-25 (Jared):** the paid dice need to be *visually* worth
paying for — **shiny, eye-catching, obviously special** next to the free Classic
set. Right now they are colour swaps with slightly different material settings,
which is not a $2 experience.

**Deliberately deferred until after the launch build-out is complete.** This is
polish on a product that already sells; it is not a launch blocker, and doing it
early would mean re-doing it once the surrounding store work settles. Recorded
here so it survives the launch push rather than living in a chat log.

When it is picked up: the material knobs already exist per skin in
`src/data/diceSkins.ts` (`metalness`, `roughness`, `emissiveMult`, `clearcoat`,
`clearcoatRoughness`, plus per-face `f`/`e` colours), so the lever is the
three.js material treatment, not new plumbing. Worth considering an environment
map for real reflections — the current sets have no environment to be shiny
*against*, which is most of why they read flat.

See `docs/MVP_LAUNCH.md` for the catalogue decision that has to land first: the
store and the dice roller currently ship two different lists of paid dice.

---

## Infrastructure (cross-cutting, supports all tracks)

Deferred items that make the daily loop real:
- **Keep-warm cron** — prevent Supabase auto-pause (has caused 2 outages). The one
  genuinely daily-scheduled, fully-safe-to-run-unattended task. Highest priority.
- **Frontend resilience** — bounded timeout + retry on session restore, replacing
  the infinite "Loading…" spinner when auth is unreachable.
- **GitHub Actions CI gate** — encode the gate (tsc ≤ `TS_BASELINE` in ci.yml / TS2304 = 0, hooks
  clean, build) on every push. Regressions can't reach prod.
- **RAW regression suite** — the Track 1 detection layer; runs daily, opens issues
  on drift, never edits.

---

## Cadence

- **Track 1:** gated sessions when real RAW work exists.
- **Track 2:** daily default — small, visible, gated ships. Bigger parity items
  (layers, fog of war) get dedicated deeper sessions, but still ship
  incrementally through the gate — there is no isolated sandbox any more.
- **Infra:** slot in as capacity allows; keep-warm cron first.

The daily continuous-improvement loop (once infra lands): keep-warm ping fires →
RAW regression suite runs and posts status → drift opens an issue with specifics.
Human involvement drops to skimming status and doing the irreducible RAW judgment
calls in gated sessions.
