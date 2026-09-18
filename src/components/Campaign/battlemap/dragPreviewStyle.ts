/** v2.720 — world-space decoration with stable screen-space legibility. */
export function dragPreviewStyle(zoom:number) {
  const scale=Number.isFinite(zoom) && zoom>0 ? zoom : 1;
  return {labelScale:1/scale,stroke:2/scale,dash:8/scale,gap:6/scale,padding:8/scale};
}
