import type {CSSProperties} from 'react';
import {COND_COLOR} from './shared';
import './MapConditionChip.css';
/** v2.861: both panels use real buttons for keyboard activation and touch-sized
 * targets. Read-only player badges never masquerade as disabled DM controls. */
export function MapConditionChip({condition,action,disabled=false,onActivate}:{condition:string;action?:'Apply'|'Remove';disabled?:boolean;onActivate?:()=>void}){
 const style={'--condition-tone':COND_COLOR[condition]??'#9ca3af'} as CSSProperties;
 const contents=<><span className="map-condition-chip-dot" aria-hidden="true"/>{condition}{action&&<span aria-hidden="true">{action==='Apply'?'+':'×'}</span>}</>;
 return action?<button type="button" className="map-condition-chip" style={style} title={`${action} ${condition}`} aria-label={`${action} ${condition}`} disabled={disabled} onClick={onActivate}>{contents}</button>:
  <span className="map-condition-chip" style={style} title={condition}>{contents}</span>;
}
