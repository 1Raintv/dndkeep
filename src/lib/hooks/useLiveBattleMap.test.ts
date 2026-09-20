// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {useLiveBattleMap} from './useLiveBattleMap';
import {useBattleMapStore,type Token} from '../stores/battleMapStore';
import type {ActiveBattleMap} from '../battleMapGeometry';
const snapshot={id:'s',grid_size:70,tokens:[{row:9,col:9}]} as ActiveBattleMap;
beforeEach(()=>useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{a:{id:'a',x:35,y:35,size:'large',combatantId:'instance',name:'Goblin'} as Token}}));
afterEach(cleanup);
it('updates attack geometry after a token moves and retains instance and footprint',()=>{
  const {result}=renderHook(()=>useLiveBattleMap(snapshot));
  expect(result.current?.tokens[0]).toMatchObject({row:0,col:0,combatant_id:'instance',size:2});
  act(()=>useBattleMapStore.getState().updateTokenPosition('a',140,210));
  expect(result.current?.tokens[0]).toMatchObject({row:3,col:2});
  act(()=>useBattleMapStore.getState().removeToken('a'));expect(result.current?.tokens).toEqual([]);
});
it('does not use another scene or a partial hydration, and permits a snapshot with the map closed',()=>{
  const {result}=renderHook(()=>useLiveBattleMap(snapshot));
  act(()=>useBattleMapStore.setState({loading:true}));expect(result.current).toBeNull();
  act(()=>useBattleMapStore.setState({loading:false,currentSceneId:'other'}));expect(result.current).toBeNull();
  act(()=>useBattleMapStore.setState({currentSceneId:null}));expect(result.current).toBe(snapshot);
});
