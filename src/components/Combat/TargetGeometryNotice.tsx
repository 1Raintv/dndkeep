/** v2.801 — a retry never selects targets or spends a spell slot. */
export function TargetGeometryNotice({loading,failed,onRetry}:{loading:boolean;failed:boolean;onRetry:()=>void}){
  const style={padding:'10px 14px',fontSize:13,color:'var(--t-2)'};
  if(loading)return <div role="status" style={style}>Checking target distances…</div>;
  if(failed)return <div role="alert" style={style}>Could not check target distances. <button onClick={onRetry}>Try again</button></div>;
  return null;
}
