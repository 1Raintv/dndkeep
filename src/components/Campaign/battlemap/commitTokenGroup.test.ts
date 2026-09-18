import { beforeEach, expect, it, vi } from 'vitest';
import { commitTokenGroup } from './commitTokenGroup';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
import {beginTokenMove,isTokenMovePending} from './pendingTokenMoves';
vi.mock('../../../lib/api/tokensApiRouter',()=>({updateTokenPos:vi.fn()}));
const moves=['a','b'].map(id=>({id,from:{x:35,y:35},to:{x:105,y:35}}));
it('does not optimistically move a formation with a pending member',async()=>{
  const release=beginTokenMove(['b'])!;
  try{const result=await commitTokenGroup(moves,'c',()=>true);
    expect(result).toEqual({saved:[],failed:true});expect(api.updateTokenPos).not.toHaveBeenCalled();
    expect(useBattleMapStore.getState().tokens.a.x).toBe(35);expect(isTokenMovePending('a')).toBe(false);
  }finally{release();}
});
it('reserves every member until all writes settle and releases failures',async()=>{
  let finish!:(value:any)=>void;
  vi.mocked(api.updateTokenPos).mockReturnValueOnce(new Promise(r=>finish=r)).mockRejectedValueOnce(new Error('offline'));
  const saving=commitTokenGroup(moves,'c',()=>true);
  expect(isTokenMovePending('a')).toBe(true);expect(isTokenMovePending('b')).toBe(true);
  finish({ok:true});await saving;
  expect(isTokenMovePending('a')).toBe(false);expect(isTokenMovePending('b')).toBe(false);
});
beforeEach(()=>{
  vi.resetAllMocks();
  useBattleMapStore.setState({tokens:Object.fromEntries(moves.map(m=>[m.id,{id:m.id,...m.from} as Token]))});
});
it('keeps only saved members in history and restores failed previews',async()=>{
  vi.mocked(api.updateTokenPos).mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({ok:false,reason:'other'});
  const broadcast=vi.fn();
  const result=await commitTokenGroup(moves,'c',()=>true,broadcast);
  expect(result).toEqual({saved:[moves[0]],failed:true});
  expect(useBattleMapStore.getState().tokens.b.x).toBe(35);
  expect(broadcast).toHaveBeenLastCalledWith('b',35,35);
});
it('does not save into a departed scene',async()=>{
  await commitTokenGroup(moves,'c',()=>false);
  expect(api.updateTokenPos).not.toHaveBeenCalled();
  expect(useBattleMapStore.getState().tokens.a.x).toBe(35);
});
it('preserves a newer peer move received during an earlier save',async()=>{
  vi.mocked(api.updateTokenPos).mockImplementationOnce(async()=>{
    useBattleMapStore.getState().updateTokenPosition('b',175,35);
    return {ok:true};
  });
  const result=await commitTokenGroup(moves,'c',()=>true);
  expect(api.updateTokenPos).toHaveBeenCalledTimes(1);
  expect(result.saved).toEqual([moves[0]]);
  expect(useBattleMapStore.getState().tokens.b.x).toBe(175);
});
