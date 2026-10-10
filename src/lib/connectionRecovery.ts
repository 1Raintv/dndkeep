import {validConnectionRequest,type ConnectionRequest} from './api/telepathicConnection';
import {replaySeededDice} from '../rules/dice';
const key=(characterId:string)=>`dndkeep:connection:${characterId}`;
const interrupted=()=>new Error('Connection recovery needs review. Keep this browser data; do not roll again.');
const recoverable=()=>new Error('Your original Connection roll is saved. Confirm the saved extension when browser storage is available. Do not clear site data.');
type Preparation={kind:'preparing';version:2;attemptId:string;sides:number;request:Omit<ConnectionRequest,'roll'>};
function decode(raw:string):ConnectionRequest {
 let value:unknown;try{value=JSON.parse(raw);}catch{throw interrupted();}
 if(validConnectionRequest(value))return value;
 const p=value as Preparation|null;
 if(!p||p.kind!=='preparing'||p.version!==2||!p.request||!validConnectionRequest({...p.request,roll:1})||![6,8,10,12].includes(p.sides))throw interrupted();
 const faces=replaySeededDice(p.attemptId,p.sides,1);if(!faces)throw interrupted();
 return {...p.request,roll:faces[0]};
}
export function pendingConnection(characterId:string):ConnectionRequest|null {
 const raw=localStorage.getItem(key(characterId));return raw===null?null:decode(raw);
}
/** A decoded seed is not yet a durably saved request. Promote it before any
 * network send, refusing changed dice, turn or free-use evidence on retry. */
export function rememberConnection(characterId:string,request:ConnectionRequest){
 if(!validConnectionRequest(request))throw new Error('Invalid saved Connection request.');
 const prior=localStorage.getItem(key(characterId)),encoded=JSON.stringify(request);
 if(prior!==null&&JSON.stringify(decode(prior))!==encoded)throw new Error('Confirm the original Connection request before changing it.');
 try{localStorage.setItem(key(characterId),encoded);}catch(cause){if(prior!==null)throw recoverable();throw cause;}
}
/** v2.869: persist entropy and reviewed context BEFORE deriving a die face.
 * Legacy seedless markers cannot be recovered; never manufacture their roll. */
export function prepareConnection(characterId:string,input:Omit<ConnectionRequest,'roll'>,sides:number):ConnectionRequest {
 const request=structuredClone(input);
 if(!validConnectionRequest({...request,roll:1})||![6,8,10,12].includes(sides))throw new Error('Invalid Connection declaration.');
 if(pendingConnection(characterId))throw new Error('Confirm the saved Connection before rolling again.');
 const preparation:Preparation={kind:'preparing',version:2,attemptId:crypto.randomUUID(),sides,request};
 const encoded=JSON.stringify(preparation);localStorage.setItem(key(characterId),encoded);
 const pending=decode(encoded);rememberConnection(characterId,pending);return pending;
}
export function forgetConnection(characterId:string,requestId:string){
 try{if(pendingConnection(characterId)?.requestId===requestId)localStorage.removeItem(key(characterId));}catch{/* A leftover exact replay is safer than replacing the saved roll. */}
}
