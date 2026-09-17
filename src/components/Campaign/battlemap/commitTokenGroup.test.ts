import { beforeEach, expect, it, vi } from 'vitest';
import { commitTokenGroup } from './commitTokenGroup';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
vi.mock('../../../lib/api/tokensApiRouter',()=>({updateTokenPos:vi.fn()}));
const moves=['a','b'].map(id=>({id,from:{x:35,y:35},to:{x:105,y:35}}));
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
