// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TokenContextMenu} from './TokenContextMenu';
import {useBattleMapStore,type Token} from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
vi.mock('../../../lib/api/tokensApiRouter',()=>({updateToken:vi.fn(),deleteToken:vi.fn(),createToken:vi.fn()}));
vi.mock('../../shared/Modal',()=>({useModal:()=>({prompt:vi.fn()})}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:vi.fn()})}));
vi.mock('./useMapMenuPosition',()=>({useMapMenuPosition:()=>({ref:{current:null},left:8,top:8})}));
beforeEach(()=>{vi.resetAllMocks();useBattleMapStore.setState({currentSceneId:'scene',tokens:{a:{id:'a',sceneId:'scene',name:'Marker',size:'medium',x:35,y:35,characterId:null,npcId:null,creatureId:null,combatantId:null,visibleToAll:true} as Token}});});
afterEach(cleanup);
const setup=()=>{const close=vi.fn();render(<TokenContextMenu state={{tokenId:'a',clientX:20,clientY:20}} isDM campaignId="c" gridSizePx={70} onClose={close} onRequestUpload={vi.fn()}/>);return close;};
it('keeps old fields while saving, prevents duplicate clicks, then applies a confirmed edit',async()=>{
  let finish!:(ok:boolean)=>void;vi.mocked(api.updateToken).mockReturnValue(new Promise(r=>{finish=r;}));const close=setup();
  const hide=screen.getByRole('button',{name:'◉ Hide from Players'});fireEvent.click(hide);fireEvent.click(hide);
  expect(api.updateToken).toHaveBeenCalledTimes(1);expect(useBattleMapStore.getState().tokens.a.visibleToAll).toBe(true);expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(window,{key:'Escape'});expect(close).not.toHaveBeenCalled();
  await act(async()=>finish(true));expect(useBattleMapStore.getState().tokens.a.visibleToAll).toBe(false);expect(close).toHaveBeenCalledOnce();
});
it('keeps a failed edit retryable and handles false results and thrown failures',async()=>{
  vi.mocked(api.updateToken).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(true);const close=setup();
  for(let i=0;i<2;i++) {fireEvent.click(screen.getByRole('button',{name:'◉ Hide from Players'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Save token failed'));expect(useBattleMapStore.getState().tokens.a.visibleToAll).toBe(true);expect(close).not.toHaveBeenCalled();}
  fireEvent.click(screen.getByRole('button',{name:'◉ Hide from Players'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(useBattleMapStore.getState().tokens.a.visibleToAll).toBe(false);
});
it('retains a token on failed delete and removes it only after a successful retry',async()=>{
  vi.mocked(api.deleteToken).mockResolvedValueOnce(false).mockResolvedValueOnce(true);const close=setup();
  fireEvent.click(screen.getByRole('button',{name:'Delete'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Delete token failed'));expect(useBattleMapStore.getState().tokens.a).toBeDefined();expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Delete'}));await waitFor(()=>expect(useBattleMapStore.getState().tokens.a).toBeUndefined());expect(close).toHaveBeenCalledOnce();
});
it('does not leave a phantom duplicate on a false create result',async()=>{
  vi.mocked(api.createToken).mockResolvedValueOnce(false).mockResolvedValueOnce(true);setup();
  fireEvent.click(screen.getByRole('button',{name:'⧉ Duplicate'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Duplicate token failed'));expect(Object.keys(useBattleMapStore.getState().tokens)).toEqual(['a']);
  fireEvent.click(screen.getByRole('button',{name:'⧉ Duplicate'}));await waitFor(()=>expect(Object.keys(useBattleMapStore.getState().tokens)).toHaveLength(2));
});
it('does not inject an old duplicate into a newly selected scene',async()=>{
  let finish!:(ok:boolean)=>void;vi.mocked(api.createToken).mockReturnValue(new Promise(r=>{finish=r;}));setup();fireEvent.click(screen.getByRole('button',{name:'⧉ Duplicate'}));
  await act(async()=>{useBattleMapStore.setState({currentSceneId:'other',tokens:{}});finish(true);});expect(useBattleMapStore.getState().tokens).toEqual({});
});
it('reports unsupported placement locking without a fake local change',()=>{
  useBattleMapStore.getState().updateTokenFields('a',{combatantId:'combatant'});setup();fireEvent.click(screen.getByRole('button',{name:'⊘ Lock Token'}));expect(screen.getByRole('alert').textContent).toContain('not available');expect(api.updateToken).not.toHaveBeenCalled();expect(useBattleMapStore.getState().tokens.a.isLocked).toBeUndefined();
});
