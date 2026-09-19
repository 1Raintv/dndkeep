/** v2.736 — temporary pan must not steal typing or keys owned by an overlay. */
export function canStartSpacePan(event:KeyboardEvent,canvas:HTMLCanvasElement,pointer:{x:number;y:number;buttons:number}|null):boolean {
  if(event.code!=='Space' || !pointer || pointer.buttons!==0 || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)return false;
  if(event.target instanceof Element && event.target.closest('input,textarea,select,button,summary,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]'))return false;
  if([...document.querySelectorAll('[aria-modal="true"],dialog[open]')].some(el=>el.getClientRects().length>0))return false;
  return document.elementFromPoint(pointer.x,pointer.y)===canvas;
}
