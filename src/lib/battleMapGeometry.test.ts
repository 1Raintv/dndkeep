import {expect,it,vi} from 'vitest';
import {distanceBetweenParticipantsFtUsingMap,findTokenForParticipant,type ActiveBattleMap} from './battleMapGeometry';
vi.mock('./supabase',()=>({supabase:{}}));

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
