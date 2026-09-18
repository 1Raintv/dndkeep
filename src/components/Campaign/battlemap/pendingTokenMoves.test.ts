import {expect,it} from 'vitest';
import {beginTokenMove,isTokenMovePending} from './pendingTokenMoves';
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
