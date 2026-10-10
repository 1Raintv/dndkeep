import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rows:[] as Record<string,unknown>[],tokens:[] as Record<string,unknown>[],markers:[] as string[]}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:(fields:string)=>{
 let id:string|undefined;
 const result=()=>({data:m.rows.filter(r=>!id||r.id===id).map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>fields.includes(k)))),error:null});
 const query={eq:(key:string,value:string)=>{if(key==='id')id=value;return query;},
 maybeSingle:async()=>{if(fields==='once_per_turn_used'){m.markers.push(id!);return {data:{once_per_turn_used:['aura_save:origin:test']},error:null};}return {...result(),data:result().data[0]??null};},
 then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};
 return query;
}})}}));
vi.mock('./battleMapGeometry',async original=>({...await original<typeof import('./battleMapGeometry')>(),loadActiveBattleMap:async()=>({tokens:m.tokens})}));
import {listActiveAuras,evaluateAurasOnMovement,evaluateAurasOnTurnEnd,auraSpeedMultiplier} from './auras';
const token=(id:string,col:number)=>({id,combatant_id:id,name:'Goblin',creature_id:'species',row:0,col,size:1});
beforeEach(()=>{
 m.markers=[];
 const spec={key:'test',name:'Aura',radiusFt:5,saveAbility:'WIS',saveDC:15,damageDice:null,damageType:null,halfOnSave:false,triggers:['turn_end','creature_entered','emanation_entered'],exemptParticipantIds:[],speedInside:'half',affects:'all'};
 m.rows=[{id:'origin',name:'Goblin',participant_type:'monster',entity_id:'species',combatant_id:'caster',combatants:{active_buffs:[{key:'aura:test',aura:spec}],is_dead:false}},
 {id:'target',name:'Goblin',participant_type:'monster',entity_id:'species',combatant_id:'victim',combatants:{active_buffs:[],is_dead:false}}];
 m.tokens=[token('decoy',20),token('caster',0),token('victim',1)];
});
it('resolves an aura origin among identical creature names and definitions',async()=>{
 const auras=await listActiveAuras('campaign','encounter');expect(auras).toHaveLength(1);expect(auras[0].originCol).toBe(0);
});
it('checks the exact outgoing token rather than a same-species copy',async()=>{
 await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target'});expect(m.markers).toEqual(['target']);
 m.markers=[];m.tokens.find(t=>t.id==='victim')!.col=10;
 await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target'});expect(m.markers).toEqual([]);
});
it('applies the speed aura to the linked token',async()=>{
 expect(await auraSpeedMultiplier({campaignId:'campaign',encounterId:'encounter',participantId:'target'})).toBe(.5);
 m.tokens.find(t=>t.id==='victim')!.col=10;
 expect(await auraSpeedMultiplier({campaignId:'campaign',encounterId:'encounter',participantId:'target'})).toBe(1);
});
it('checks creatures swept by the moving origin',async()=>{
 await evaluateAurasOnMovement({campaignId:'campaign',encounterId:'encounter',moverParticipantId:'origin',fromRow:0,fromCol:10,toRow:0,toCol:0});expect(m.markers).toEqual(['target']);
});
it('uses the linked moving creature footprint when entering an aura',async()=>{
 m.tokens.find(t=>t.id==='victim')!.size=2;
 await evaluateAurasOnMovement({campaignId:'campaign',encounterId:'encounter',moverParticipantId:'target',fromRow:0,fromCol:-10,toRow:0,toCol:-2});expect(m.markers).toEqual(['target']);
});
