// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useSpellTargetGeometry} from './useSpellTargetGeometry';
import {loadActiveBattleMap,type ActiveBattleMap,type ParticipantForTokenLookup} from '../battleMapGeometry';
import {useBattleMapStore,type Token} from '../stores/battleMapStore';
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('../battleMapGeometry',async original=>({...await original<object>(),loadActiveBattleMap:vi.fn()}));
const caster:ParticipantForTokenLookup={id:'hero',name:'Hero',participant_type:'character',entity_id:'hero'};
const participants:ParticipantForTokenLookup[]=[{id:'g',name:'Goblin',participant_type:'creature',entity_id:'goblin',combatant_id:'two'}];
const map={id:'s',grid_size:70,tokens:[],walls:[]} as unknown as ActiveBattleMap;
afterEach(()=>{cleanup();vi.resetAllMocks();useBattleMapStore.setState({currentSceneId:null,tokens:{}});});
it('updates footprint and clears obsolete cover when a creature moves off the blocked line',async()=>{
  vi.mocked(loadActiveBattleMap).mockResolvedValue(map);
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero'} as Token,
    one:{id:'one',x:105,y:35,size:'medium',creatureId:'goblin',combatantId:'one',name:'Goblin'} as Token,
    two:{id:'two',x:595,y:35,size:'medium',creatureId:'goblin',combatantId:'two',name:'Goblin'} as Token,
  }});
  const {result}=renderHook(()=>useSpellTargetGeometry(true,'c',caster,participants));
  await waitFor(()=>expect(result.current.positions?.get('g')).toEqual({row:0,col:8}));
  expect(result.current.coverByTarget.g).toBe('half');
  const footprint=result.current.footprints?.get('g');
  act(()=>useBattleMapStore.getState().updateTokenPosition('two',35,595));
  expect(result.current.positions?.get('g')).toEqual({row:8,col:0});
  expect(result.current.footprints?.get('g')).not.toEqual(footprint);
  expect(result.current.coverByTarget.g).toBeUndefined();
});
it('ignores a late map response after changing scenes',async()=>{
  let resolve!:(map:ActiveBattleMap)=>void;
  vi.mocked(loadActiveBattleMap).mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({...map,id:'new'});
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{}});
  const {result}=renderHook(()=>useSpellTargetGeometry(true,'c',caster,participants));
  act(()=>useBattleMapStore.setState({currentSceneId:'new'}));
  await waitFor(()=>expect(result.current.battleMap?.id).toBe('new'));
  await act(async()=>resolve(map));expect(result.current.battleMap?.id).toBe('new');
});
