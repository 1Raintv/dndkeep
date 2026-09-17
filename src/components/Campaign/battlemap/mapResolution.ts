/** v2.702 — crisp Retina output without multiplying large-display GPU work
 * indefinitely. Logical coordinates remain CSS pixels at every density. */
export function mapResolution(width:number,height:number,dpr:number):number {
  if(!Number.isFinite(dpr) || dpr<1) return 1;
  const area=Math.max(1,width*height);
  return Math.max(1,Math.min(2,dpr,Math.sqrt(8_000_000/area)));
}
