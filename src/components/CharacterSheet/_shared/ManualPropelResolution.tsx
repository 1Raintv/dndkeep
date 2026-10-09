import {psionicRollNote} from '../../../rules/psionicEnhancedRoll';
import {useEffect,useRef,useState} from 'react';
import ModalPortal from '../../shared/ModalPortal';
import type {PsionicPowerUse} from '../../../rules/psionicPowers';
/** Manual tabletop fallback: never infer a failed save when no encounter exists. */
export default function ManualPropelResolution({use,dc,onResolve,onClose}:{use:Extract<PsionicPowerUse,{kind:'propel'}>;dc:number;onResolve:(failed:boolean)=>void;onClose:()=>void}) {
 const [done,setDone]=useState(false);const dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector('button')?.focus();
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const buttons=dialog.current?.querySelectorAll('button');if(!buttons?.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[onClose]);
 return <ModalPortal><div className="modal-overlay" onClick={onClose}><div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-label="Telekinetic Propel" style={{width:440,maxWidth:'calc(100vw - 32px)',padding:20}} onClick={e=>e.stopPropagation()}>
 <h3>{use.movement==='warp'?'Warp Propel':'Telekinetic Propel'} · Bonus Action</h3>
 <p>Choose one Large or smaller creature other than yourself that you can see within 30 ft. Resolve its DC {dc} Strength save at the table.</p>
 <p>{use.movement==='warp'?'On a failed save, teleport the target to an unoccupied space you can see within 30 ft of you, horizontal to you.':use.mode==='free'?'Free push/pull: 5 ft.':`${use.enkindledRolls?.length?`Dice total ${use.roll}`:use.surged?`Psionic Surge treats ${use.originalRoll} as ${use.roll}`:`Rolled ${use.roll}`}: ${use.roll*5} ft on a failed save.`} {use.movement!=='warp'&&'Movement is straight toward or away from you.'}</p>
 {use.movement==='warp'&&use.mode==='powered'&&<p>Energy Die result: {use.roll}. The teleport destination stays within 30 ft of you.</p>}
 {use.enkindledRolls?.length?<p>{psionicRollNote(use.roll,use)}</p>:null}
 <p>{use.mode==='powered'?'Spend 1 die only if the target fails.':'No die spent.'} Apply the movement on the map.</p>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
 <button className="btn-ghost" onClick={onClose}>Cancel</button>
 <button className="btn-ghost" disabled={done} onClick={()=>{setDone(true);onResolve(false);}}>Save passed</button>
 <button className="btn-primary" disabled={done} onClick={()=>{setDone(true);onResolve(true);}}>Save failed</button>
 </div></div></div></ModalPortal>;
}
