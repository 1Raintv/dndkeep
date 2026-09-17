import { expect, it, vi } from 'vitest';
import { createTokenMoveHistory } from './tokenMoveHistory';

it('retries only unfinished saves after a partial group undo failure', async () => {
  const positions: Record<string,{x:number;y:number}>={a:{x:70,y:0},b:{x:140,y:0}};
  let fail=true;
  const save=vi.fn(async (id:string,p:{x:number;y:number})=>{if(id==='b'&&fail) throw new Error('offline'); positions[id]=p;});
  const action=createTokenMoveHistory([
    {id:'a',from:{x:0,y:0},to:positions.a}, {id:'b',from:{x:70,y:0},to:positions.b},
  ],{read:id=>positions[id],blocked:()=>false,save});
  await expect(action.backward()).rejects.toThrow('offline');
  fail=false;
  await action.backward();
  expect(save.mock.calls.filter(([id])=>id==='a')).toHaveLength(1);
  expect(positions).toEqual({a:{x:0,y:0},b:{x:70,y:0}});
  await action.forward();
  expect(positions).toEqual({a:{x:70,y:0},b:{x:140,y:0}});
});

it.each(['changed','held','deleted'])('refuses to overwrite a %s token', async reason => {
  const save=vi.fn();
  const action=createTokenMoveHistory([{id:'a',from:{x:0,y:0},to:{x:70,y:0}}],{
    read:()=>reason==='deleted'?undefined:{x:reason==='changed'?140:70,y:0},blocked:()=>reason==='held',save,
  });
  await expect(action.backward()).rejects.toThrow();
  expect(save).not.toHaveBeenCalled();
});
