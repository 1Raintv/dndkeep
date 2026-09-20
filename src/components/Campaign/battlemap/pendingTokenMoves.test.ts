import {expect,it,vi} from 'vitest';
import {beginTokenMove,isTokenMovePending,subscribeTokenMoves,tokenMoveRevision} from './pendingTokenMoves';
it('notifies subscribers only when a reservation changes',()=>{
  const listener=vi.fn(),unsubscribe=subscribeTokenMoves(listener),before=tokenMoveRevision();
  const release=beginTokenMove(['notify'])!;
  try {
    expect(listener).toHaveBeenCalledTimes(1);
    expect(beginTokenMove(['notify'])).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    release();release();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(tokenMoveRevision()).toBe(before+2);
  } finally {release();unsubscribe();}
});
it('reserves a formation atomically and permits unrelated moves',()=>{
  const release=beginTokenMove(['a'])!;
  try{expect(beginTokenMove(['b','a'])).toBeNull();expect(isTokenMovePending('b')).toBe(false);
    const other=beginTokenMove(['b'])!;expect(isTokenMovePending('b')).toBe(true);other();
  }finally{release();}
  expect(isTokenMovePending('a')).toBe(false);
});
it('cannot release a newer reservation when an old completion repeats',()=>{
  const old=beginTokenMove(['a','a'])!;old();const current=beginTokenMove(['a'])!;
  try{old();expect(isTokenMovePending('a')).toBe(true);}finally{current();}
});
