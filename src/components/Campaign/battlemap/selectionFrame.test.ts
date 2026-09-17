import {describe,it,expect} from 'vitest';
import type {Token} from '../../../lib/map/mapTypes';
import {selectionFrame} from './selectionFrame';

const token=(x:number,y:number,size:Token['size']='medium')=>({x,y,size} as Token);
describe('selectionFrame',()=>{
  it('fits widely separated tokens on a narrow screen',()=>{
    const f=selectionFrame([token(35,35),token(1435,735)],70,400,800,4)!;
    expect(f).toEqual({x:735,y:385,zoom:320/1470});
    expect(1470*f.zoom).toBeLessThanOrEqual(320);
  });
  it('uses full even and odd footprints and bounds rather than average centres',()=>{
    expect(selectionFrame([token(140,140,'gargantuan'),token(140,140),token(1750,1050)],70,1000,800,4))
      .toEqual({x:945,y:595,zoom:800/1680});
  });
  it('fits tall selections by height',()=>{
    expect(selectionFrame([token(35,35),token(35,1435)],70,1000,400,4)?.zoom).toBe(320/1470);
  });
  it('preserves a comfortable zoom instead of zooming in on one token',()=>{
    expect(selectionFrame([token(140,140,'large')],70,1200,800,.5))
      .toEqual({x:210,y:210,zoom:.5});
  });
  it('ignores empty selections and unmeasured viewports',()=>{
    expect(selectionFrame([],70,400,800,1)).toBeNull();
    expect(selectionFrame([token(35,35)],70,0,800,1)).toBeNull();
  });
  it('centres tokens inside the unobstructed region',()=>{
    const f=selectionFrame([token(35,35)],70,400,800,1,{left:80,top:240,right:400,bottom:600})!;
    expect((35-f.x)*f.zoom+200).toBe(240);
    expect((35-f.y)*f.zoom+400).toBe(420);
    expect(f.zoom).toBe(1);
  });
});
