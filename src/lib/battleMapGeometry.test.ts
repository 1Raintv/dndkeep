import {expect,it,vi,describe} from 'vitest';
import {distanceBetweenParticipantsFtUsingMap,findTokenForParticipant,buildParticipantPositions,
  resolveParticipantTokens,participantLookup,loadActiveBattleMap,type ActiveBattleMap} from './battleMapGeometry';

// v2.746 — the loader test needs a fluent client; everything else runs on
// the pure helpers. Recording proxy: any chain resolves to `respond(table)`.
const h=vi.hoisted(()=>{
  const state={respond:((_t:string)=>({data:null,error:null})) as (t:string)=>{data:unknown;error:unknown}};
  function builder(table:string):unknown{
    const b:unknown=new Proxy({},{get(_t,prop){
      if(prop==='then')return (res:(v:unknown)=>unknown,rej:(e:unknown)=>unknown)=>Promise.resolve().then(()=>state.respond(table)).then(res,rej);
      return ()=>b;
    }});
    return b;
  }
  return {state,supabase:{from:(t:string)=>builder(t)}};
});
vi.mock('./supabase',()=>({supabase:h.supabase}));
vi.mock('./api/scenePlacements',()=>({getUseCombatantsFlag:async()=>true}));

const actor={id:'actor',name:'Hero',participant_type:'character' as const,entity_id:'hero'};
const goblin={id:'g2',name:'Goblin 2',participant_type:'creature' as const,entity_id:'goblin'};
const map={tokens:[{row:0,col:0,character_id:'hero'},{row:0,col:1,name:'Goblin 1',creature_id:'goblin'},{row:0,col:8,name:'Goblin 2',creature_id:'goblin'}]} as ActiveBattleMap;
it('measures each copy of a creature from its own token, independent of list order',()=>{
  expect(distanceBetweenParticipantsFtUsingMap(actor,goblin,map)).toBe(40);
  expect(distanceBetweenParticipantsFtUsingMap(actor,goblin,{...map,tokens:[...map.tokens].reverse()})).toBe(40);
});
it('does not guess the first creature when duplicate identities have no unique name',()=>{
  expect(findTokenForParticipant({...goblin,name:'Goblin'},map.tokens)).toBeNull();
});
it('resolves identical creature names by combatant instance and excludes a different linked instance',()=>{
  const tokens=[{row:0,col:1,name:'Goblin',creature_id:'goblin',combatant_id:'one'},{row:0,col:8,name:'Goblin',creature_id:'goblin',combatant_id:'two'}];
  expect(findTokenForParticipant({...goblin,name:'Goblin',combatant_id:'two'},tokens)).toBe(tokens[1]);
  expect(findTokenForParticipant({...goblin,name:'Goblin',combatant_id:'absent'},tokens)).toBeNull();
});
it('keeps unique legacy identity and name fallback, without matching a different definition',()=>{
  expect(findTokenForParticipant(goblin,[map.tokens[2]])).toBe(map.tokens[2]);
  const unlinked={row:1,col:2,name:'Goblin 2'};
  expect(findTokenForParticipant(goblin,[unlinked])).toBe(unlinked);
  expect(findTokenForParticipant(goblin,[{...unlinked,creature_id:'different'}])).toBeNull();
});

describe('v2.746 per-instance fallback',()=>{
  const A={id:'tA',row:0,col:1,name:'Goblin',creature_id:'goblin',combatant_id:'one'};
  const B={id:'tB',row:0,col:8,name:'Goblin',creature_id:'goblin',combatant_id:'two'};
  it('falls back to the ONLY unclaimed same-definition token when its combatant is not on the scene',()=>{
    expect(findTokenForParticipant({...goblin,name:'Goblin',combatant_id:'absent'},[A])).toBe(A);
  });
  it('never guesses between two unclaimed same-definition tokens',()=>{
    expect(findTokenForParticipant({...goblin,name:'Goblin',combatant_id:'absent'},[A,B])).toBeNull();
  });
  it('two-pass resolution hands the unclaimed token to the orphan participant in either list order',()=>{
    const p1={id:'p1',name:'Goblin',participant_type:'creature' as const,entity_id:'goblin',combatant_id:'one'};
    const p2={id:'p2',name:'Goblin',participant_type:'creature' as const,entity_id:'goblin',combatant_id:'absent'};
    for(const list of [[p1,p2],[p2,p1]]){
      const pos=buildParticipantPositions(list,[A,B]);
      expect(pos.get('p1')).toEqual({row:0,col:1});
      expect(pos.get('p2')).toEqual({row:0,col:8});
      const res=resolveParticipantTokens(list,[A,B]);
      expect(res.get('p1')).toBe(A);
      expect(res.get('p2')).toBe(B);
    }
  });
  it('a character participant never falls back to a creature token sharing its entity_id',()=>{
    const weird={id:'tX',row:2,col:2,name:'Hero',creature_id:'hero',combatant_id:'cx'};
    expect(findTokenForParticipant({...actor,combatant_id:'absent'},[weird])).toBeNull();
  });
  it('participantLookup always carries combatant_id (null when the row has none)',()=>{
    expect(participantLookup({id:'p',name:'N',participant_type:'creature',entity_id:'e',combatant_id:'c'}))
      .toEqual({id:'p',name:'N',participant_type:'creature',entity_id:'e',combatant_id:'c'});
    expect(participantLookup({id:'p',name:'N',participant_type:'character'}).combatant_id).toBeNull();
  });
  it('loadActiveBattleMap maps narrative_npc / srd_monster placements to creature_id',async()=>{
    h.state.respond=(table)=>{
      if(table==='scenes')return {data:{id:'scene',grid_size_px:70,width_cells:10,height_cells:10},error:null};
      if(table==='scene_token_placements')return {data:[
        {id:'pl1',combatant_id:'cb1',x:70,y:0,size_override:'small',combatants:{id:'cb1',name:'Goblin',definition_type:'narrative_npc',definition_id:'goblin'}},
        {id:'pl2',combatant_id:'cb2',x:140,y:0,size_override:'medium',combatants:{id:'cb2',name:'Wolf',definition_type:'srd_monster',definition_id:'wolf'}},
        {id:'pl3',combatant_id:'cb3',x:0,y:0,size_override:'medium',combatants:{id:'cb3',name:'Hero',definition_type:'character',definition_id:'hero'}},
      ],error:null};
      return {data:[],error:null};
    };
    const m=await loadActiveBattleMap('camp',{viewedSceneId:'scene'});
    expect(m).not.toBeNull();
    const byId=Object.fromEntries(m!.tokens.map(t=>[t.id as string,t]));
    expect(byId.pl1.creature_id).toBe('goblin');
    expect(byId.pl1.character_id).toBeUndefined();
    expect(byId.pl2.creature_id).toBe('wolf');
    expect(byId.pl3.character_id).toBe('hero');
    expect(byId.pl3.creature_id).toBeUndefined();
    expect(byId.pl1.col).toBe(1);
  });
});
