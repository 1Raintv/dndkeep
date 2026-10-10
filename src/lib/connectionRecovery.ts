import {validConnectionRequest,type ConnectionRequest} from './api/telepathicConnection';
const key=(characterId:string)=>`dndkeep:connection:${characterId}`;
const interrupted=()=>new Error('Connection recovery needs review. Keep this browser data; do not roll again.');
export function pendingConnection(characterId:string):ConnectionRequest|null {
 const raw=localStorage.getItem(key(characterId));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw interrupted();}
 if(!validConnectionRequest(value))throw interrupted();return value;
}
/** Preserve interruption evidence before RNG, then the exact request before sending. */
export function prepareConnection(characterId:string,input:Omit<ConnectionRequest,'roll'>,roll:()=>number):ConnectionRequest {
 if(!validConnectionRequest({...input,roll:1})||pendingConnection(characterId))throw new Error('Confirm the saved Connection before rolling again.');
 localStorage.setItem(key(characterId),JSON.stringify({preparing:input.requestId}));
 const request={...input,roll:roll()};if(!validConnectionRequest(request))throw interrupted();
 localStorage.setItem(key(characterId),JSON.stringify(request));return request;
}
export function forgetConnection(characterId:string,requestId:string){
 try{if(pendingConnection(characterId)?.requestId===requestId)localStorage.removeItem(key(characterId));}catch{/* A leftover exact replay is safer than replacing the saved roll. */}
}
