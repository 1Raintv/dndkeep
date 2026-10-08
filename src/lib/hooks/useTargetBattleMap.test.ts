// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useTargetBattleMap} from './useTargetBattleMap';
import {loadActiveBattleMap} from '../battleMapGeometry';
import {useBattleMapStore} from '../stores/battleMapStore';
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('../battleMapGeometry',()=>({loadActiveBattleMap:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();useBattleMapStore.setState({currentSceneId:null,loading:false,tokens:{}});});
it('does not query or block when closed or without a campaign',()=>{
  const view=renderHook(({open,campaign})=>useTargetBattleMap(open,campaign),{initialProps:{open:false,campaign:'c' as string|null}});
  expect(view.result.current.loading).toBe(false);expect(loadActiveBattleMap).not.toHaveBeenCalled();
  view.rerender({open:true,campaign:null});expect(view.result.current.loading).toBe(false);expect(loadActiveBattleMap).not.toHaveBeenCalled();
});
it('checks again when a persistent spell dialog reopens instead of reusing its old no-map result',async()=>{
  vi.mocked(loadActiveBattleMap).mockResolvedValueOnce(null).mockReturnValueOnce(new Promise(()=>{}));
  const view=renderHook(({open})=>useTargetBattleMap(open,'c'),{initialProps:{open:true}});
  await waitFor(()=>expect(view.result.current.loading).toBe(false));
  view.rerender({open:false});view.rerender({open:true});
  expect(view.result.current.loading).toBe(true);expect(loadActiveBattleMap).toHaveBeenCalledTimes(2);
});
it('requests strict reads for the captured scene and ignores errors after close',async()=>{
  let reject!:(error:Error)=>void;
  vi.mocked(loadActiveBattleMap).mockReturnValueOnce(new Promise((_r,j)=>{reject=j;}));
  useBattleMapStore.setState({currentSceneId:'s'});
  const view=renderHook(({open})=>useTargetBattleMap(open,'c'),{initialProps:{open:true}});
  expect(loadActiveBattleMap).toHaveBeenCalledWith('c',{viewedSceneId:'s',throwOnError:true});
  view.rerender({open:false});await act(async()=>reject(new Error('late')));
  expect(view.result.current.failed).toBe(false);expect(view.result.current.loading).toBe(false);
});
