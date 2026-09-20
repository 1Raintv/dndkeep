/** v2.742 — leave a 10px gap and 8px screen margin on either side of the dock. */
export function mapHelpPlacement(top:number,bottom:number,screenHeight:number) {
  const above=Math.max(0,top-18),below=Math.max(0,screenHeight-bottom-18);
  const side=above>=below?'above':'below';
  return {side,height:Math.min(380,screenHeight/2,side==='above'?above:below)};
}
