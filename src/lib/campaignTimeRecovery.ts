import {validCampaignTimeRequest,type CampaignTimeRequest} from './api/campaignTime';
export interface SavedCampaignTime {version:1;userId:string;request:CampaignTimeRequest}
export const CAMPAIGN_TIME_CHANGED='dndkeep:campaign-time-changed';
const prefix=(u:string,c:string)=>`dndkeep:campaign-time:${u}:${c}:`;
const key=(s:SavedCampaignTime)=>prefix(s.userId,s.request.campaignId)+s.request.requestId;
const notify=()=>window.dispatchEvent(new Event(CAMPAIGN_TIME_CHANGED));
export function savedCampaignTime(user:string,campaign:string):SavedCampaignTime[]{
 const result:SavedCampaignTime[]=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k?.startsWith(prefix(user,campaign)))continue;
  let s:SavedCampaignTime;try{s=JSON.parse(localStorage.getItem(k)??'null');}catch{throw new Error('Saved time advance is unreadable.');}
  if(!s||s.version!==1||s.userId!==user||!validCampaignTimeRequest(s.request)||s.request.campaignId!==campaign||key(s)!==k)throw new Error('Saved time advance could not be verified.');result.push(s);
 }
 return result.sort((a,b)=>a.request.requestId.localeCompare(b.request.requestId));
}
export function saveCampaignTime(userId:string,request:CampaignTimeRequest):SavedCampaignTime {
 if(!userId||!validCampaignTimeRequest(request))throw new Error('Time advance could not be saved.');
 if(savedCampaignTime(userId,request.campaignId).length)throw new Error('Resolve the saved time advance first.');
 const saved:SavedCampaignTime={version:1,userId,request:structuredClone(request)};
 localStorage.setItem(key(saved),JSON.stringify(saved));notify();return saved;
}
export function forgetCampaignTime(saved:SavedCampaignTime){
 const existing=localStorage.getItem(key(saved));if(existing!==null&&existing!==JSON.stringify(saved))throw new Error('Saved time advance changed. Refresh before continuing.');
 localStorage.removeItem(key(saved));notify();
}
