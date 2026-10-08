interface Recording {pending:unknown;busy:boolean;error:string;retry:()=>Promise<boolean>;discard:()=>void}
export function ConcentrationRecordingNotice({recording}:{recording:Recording}){
 if(!recording.pending&&!recording.error&&!recording.busy)return null;
 return <section role="status" aria-label="Concentration recording" style={{padding:12,border:'1px solid #f59e0b',borderRadius:8}}>
  <p>{recording.busy?'Recording concentration…':'Concentration recording needs confirmation.'}</p>
  {recording.error&&<p>{recording.error}</p>}
  <p>Retry only records the completed cast. It does not spend another slot or roll again.</p>
  {!!recording.pending&&<button type="button" disabled={recording.busy} onClick={()=>void recording.retry()}>Retry concentration recording</button>}
  <button type="button" disabled={recording.busy} onClick={recording.discard}>Discard recording</button>
  <small style={{display:'block'}}>Discarding does not end or recast the spell stored on your sheet.</small>
 </section>;
}
