// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useTargetReachPreview} from './useTargetReachPreview';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import type {ActiveBattleMap,ParticipantForTokenLookup} from '../../../lib/battleMapGeometry';
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
const actor:ParticipantForTokenLookup={name:'Hero',id:'a',entity_id:'character',participant_type:'character',combatant_id:'instance'};
const map=(size=1):ActiveBattleMap=>({id:'scene',grid_size:70,tokens:[{id:'t',combatant_id:'instance',row:2,col:3,size}]} as ActiveBattleMap);
afterEach(()=>{cleanup();useBattleMapStore.setState({reachPreview:null,currentSceneId:null});});
it.each([{size:1,x:245,y:175},{size:2,x:280,y:210},{size:3,x:245,y:175}])('uses the canonical footprint center for size $size',({size,x,y})=>{
 renderHook(()=>useTargetReachPreview(map(size),actor,15,true));
 expect(useBattleMapStore.getState().reachPreview).toEqual({sceneId:'scene',centerWorldX:x,centerWorldY:y,footprintCells:size,reachFt:15});
});
it('updates reach and position, then clears on close',()=>{
 const view=renderHook(({m,reach,enabled})=>useTargetReachPreview(m,actor,reach,enabled),{initialProps:{m:map(),reach:10,enabled:true}});
 const moved=map();moved.tokens[0].col=5;view.rerender({m:moved,reach:5,enabled:true});
 expect(useBattleMapStore.getState().reachPreview).toMatchObject({centerWorldX:385,reachFt:5});
 view.rerender({m:moved,reach:5,enabled:false});expect(useBattleMapStore.getState().reachPreview).toBeNull();
});
it('does not erase a preview installed later by another control',()=>{
 const view=renderHook(()=>useTargetReachPreview(map(),actor,10,true));
 const newer={sceneId:'scene',centerWorldX:0,centerWorldY:0,footprintCells:1,reachFt:20};
 act(()=>useBattleMapStore.getState().setReachPreview(newer));view.unmount();
 expect(useBattleMapStore.getState().reachPreview).toBe(newer);
});
it('clears on scene change and will not publish old-scene positions',()=>{
 useBattleMapStore.setState({currentSceneId:'scene'});
 const stable=map();renderHook(()=>useTargetReachPreview(stable,actor,10,true));
 act(()=>useBattleMapStore.setState({currentSceneId:'other'}));expect(useBattleMapStore.getState().reachPreview).toBeNull();
});
it.each([null,undefined,0,-5,NaN,Infinity])('does not invent reach for %s',reach=>{
 renderHook(()=>useTargetReachPreview(map(),actor,reach,true));expect(useBattleMapStore.getState().reachPreview).toBeNull();
});
it('does not guess a token from another instance or a missing map',()=>{
 const missing=map();missing.tokens[0].combatant_id='another';
 const view=renderHook(({m})=>useTargetReachPreview(m,actor,10,true),{initialProps:{m:missing as ActiveBattleMap|null}});
 expect(useBattleMapStore.getState().reachPreview).toBeNull();view.rerender({m:null});expect(useBattleMapStore.getState().reachPreview).toBeNull();
});
