// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SelectionActionBar} from './SelectionActionBar';
import {useBattleMapStore,type Token} from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),toast:vi.fn()}));
vi.mock('../../../lib/api/tokensApiRouter',()=>({updateToken:vi.fn(),deleteToken:vi.fn()}));
vi.mock('../../shared/Modal',()=>({useModal:()=>({confirm:mocks.confirm})}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
afterEach(cleanup);
beforeEach(()=>{
  vi.resetAllMocks();mocks.confirm.mockResolvedValue(true);
  useBattleMapStore.setState({tokens:{a:{id:'a',characterId:'pc',visibleToAll:true,isLocked:false} as Token,b:{id:'b',characterId:null,visibleToAll:true,isLocked:false} as Token}});
});
const setup=(open=true)=>{const clear=vi.fn();render(<SelectionActionBar selectedIds={new Set(['a','b'])} campaignId="c" onClear={clear} onMove={vi.fn()} movementDisabled={false}/>);if(open)fireEvent.click(screen.getByTitle('More selection actions'));return clear;};
it('starts compact and Escape closes actions without clearing selection',()=>{
  const clear=setup(false);expect(screen.queryByRole('button',{name:'✕ Delete'})).toBeNull();
  fireEvent.click(screen.getByTitle('More selection actions'));expect(screen.getByRole('button',{name:'✕ Delete'})).toBeDefined();
  fireEvent.keyDown(screen.getByRole('button',{name:'✕ Delete'}),{key:'Escape'});
  expect(screen.queryByRole('button',{name:'✕ Delete'})).toBeNull();expect(clear).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByTitle('More selection actions'));
});
it('hides only non-character tokens and waits for confirmed save',async()=>{
  let resolve!:(ok:boolean)=>void;vi.mocked(api.updateToken).mockReturnValue(new Promise(r=>{resolve=r;}));setup();
  fireEvent.click(screen.getByRole('button',{name:'◉ Hide'}));
  expect(api.updateToken).toHaveBeenCalledTimes(1);expect(api.updateToken).toHaveBeenCalledWith('b',{visibleToAll:false},{campaignId:'c'});
  expect(useBattleMapStore.getState().tokens.b.visibleToAll).toBe(true);
  await act(async()=>resolve(true));
  expect(useBattleMapStore.getState().tokens.a.visibleToAll).toBe(true);
  expect(useBattleMapStore.getState().tokens.b.visibleToAll).toBe(false);
});
it('keeps successful edits and reports false results and thrown failures',async()=>{
  vi.mocked(api.updateToken).mockResolvedValueOnce(true).mockResolvedValueOnce(false);setup();
  fireEvent.click(screen.getByRole('button',{name:'⊘ Lock'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('1 of 2'));
  expect(useBattleMapStore.getState().tokens.a.isLocked).toBe(true);expect(useBattleMapStore.getState().tokens.b.isLocked).toBe(false);
  vi.mocked(api.updateToken).mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByRole('button',{name:'⊙ Unlock'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('2 of 2'));
  expect(useBattleMapStore.getState().tokens.a.isLocked).toBe(true);
});
it('keeps failed deletions and reports them even when only one token remains',async()=>{
  vi.mocked(api.deleteToken).mockResolvedValueOnce(true).mockResolvedValueOnce(false);const clear=setup();
  fireEvent.click(screen.getByRole('button',{name:'✕ Delete'}));
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());
  expect(useBattleMapStore.getState().tokens.a).toBeUndefined();expect(useBattleMapStore.getState().tokens.b).toBeDefined();expect(clear).not.toHaveBeenCalled();
});
it('does not delete when confirmation is cancelled',async()=>{
  mocks.confirm.mockResolvedValue(false);setup();fireEvent.click(screen.getByRole('button',{name:'✕ Delete'}));
  await act(async()=>{});expect(api.deleteToken).not.toHaveBeenCalled();expect(Object.keys(useBattleMapStore.getState().tokens)).toHaveLength(2);
});
it('does not claim unsupported placement locks saved',()=>{
  useBattleMapStore.getState().updateTokenFields('a',{combatantId:'cb'});setup();fireEvent.click(screen.getByRole('button',{name:'⊘ Lock'}));
  expect(screen.getByRole('alert').textContent).toContain('not available');expect(api.updateToken).not.toHaveBeenCalled();
});
