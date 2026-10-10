import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rows:[] as Record<string,unknown>[],tokens:[] as Record<string,unknown>[],markers:[] as string[],error:null as {message:string}|null}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:(fields:string)=>{
 let id:string|undefined;
 const result=()=>({data:m.rows.filter(r=>!id||r.id===id).map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>fields.includes(k)))),error:m.error});
 const query={eq:(key:string,value:string)=>{if(key==='id')id=value;return query;},
 maybeSingle:async()=>{if(fields==='once_per_turn_used'){m.markers.push(id!);return {data:{once_per_turn_used:['aura_save:origin:test']},error:null};}return {...result(),data:result().data[0]??null};},
 then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};
 return query;
}})}}));
vi.mock('./battleMapGeometry',async original=>({...await original<typeof import('./battleMapGeometry')>(),loadActiveBattleMap:async()=>({tokens:m.tokens})}));
import {listActiveAuras,evaluateAurasOnTurnEnd,auraSpeedMultiplier} from './auras';
const token=(id:string,col:number)=>({id,combatant_id:id,name:'Goblin',creature_id:'species',row:0,col,size:1});
beforeEach(()=>{
 m.markers=[];m.error=null;
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
it('passes the actual outgoing target to reviewed resolution without legacy writes',async()=>{
 const resolve=vi.fn(async()=>true);await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve});
 expect(resolve).toHaveBeenCalledWith(expect.objectContaining({targetParticipantId:'target',trigger:'turn_end'}));expect(m.markers).toEqual([]);
});
it('propagates a postponed review so the clock cannot proceed',async()=>{
 const resolve=vi.fn(async()=>{throw new Error('postponed');});await expect(evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve})).rejects.toThrow('postponed');
});
it('does not resolve an enemies-only aura against the origin’s own group',async()=>{
 const cb=m.rows[0].combatants as {active_buffs:{aura:{affects:string}}[]};cb.active_buffs[0].aura.affects='enemies';
 const resolve=vi.fn(async()=>true);await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve});expect(resolve).not.toHaveBeenCalled();
 m.rows[1].participant_type='character';m.rows[1].entity_id='hero';m.tokens[2].character_id='hero';
 await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve});expect(resolve).toHaveBeenCalledTimes(1);
});
it('missing aura placement cannot silently complete reviewed turn processing',async()=>{
 m.tokens=[];await expect(evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve:vi.fn()})).rejects.toThrow(/mapped origin/);
});

it('irrelevant auras need no map placement when ending the turn',async()=>{
 m.tokens=[];const resolve=vi.fn(async()=>true);
 await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'origin',resolve});
 const cb=m.rows[0].combatants as {active_buffs:{aura:{triggers:string[]}}[]};cb.active_buffs[0].aura.triggers=['creature_entered'];
 await evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve});expect(resolve).not.toHaveBeenCalled();
});

it('failed participant reads block reviewed turn processing',async()=>{
 m.error={message:'offline'};await expect(evaluateAurasOnTurnEnd({campaignId:'campaign',encounterId:'encounter',participantId:'target',resolve:vi.fn()})).rejects.toThrow(/could not be checked/);
});
