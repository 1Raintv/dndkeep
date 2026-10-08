export interface RestResource {id:string;maximum:number;recovery:'short'|'short-partial'|'long'|'day'}
/** Recover only declared pools; preserve choices and unrelated trackers. A
 * malformed partial pool stays visible for review instead of granting uses. */
export function recoverResourcePools<T>(current:Record<string,T>,definitions:readonly RestResource[],kind:'short'|'long') {
 const result:Record<string,T|number>={...current};
 for(const {id,maximum,recovery} of definitions){
  if(maximum===999||!Number.isInteger(maximum)||maximum<0)continue;
  if(kind==='long'||recovery==='short')result[id]=maximum;
  else if(recovery==='short-partial'){
   const remaining=result[id]===undefined?maximum:result[id];
   if(typeof remaining==='number'&&Number.isInteger(remaining)&&remaining>=0&&remaining<=maximum)result[id]=Math.min(maximum,remaining+1);
  }
 }
 return result;
}
