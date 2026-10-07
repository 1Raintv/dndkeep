import {expect,it} from 'vitest';
import {rulerLabelPosition} from './rulerLabelPosition';
const size={width:100,height:20},view={width:320,height:320};
it('centers below the endpoint when there is room',()=>expect(rulerLabelPosition({x:160,y:160},size,view)).toEqual({x:110,y:174}));
it('flips above the endpoint near the bottom',()=>expect(rulerLabelPosition({x:160,y:300},size,view)).toEqual({x:110,y:266}));
it.each([[0,0],[320,0],[0,320],[320,320],[-100,-100],[1000,1000]])('keeps the full label visible at %s,%s',(x,y)=>{
 const position=rulerLabelPosition({x,y},size,view);expect(position.x).toBeGreaterThanOrEqual(6);expect(position.y).toBeGreaterThanOrEqual(6);expect(position.x+size.width).toBeLessThanOrEqual(314);expect(position.y+size.height).toBeLessThanOrEqual(314);
});
it('centers text when the canvas is too small to contain it',()=>expect(rulerLabelPosition({x:10,y:10},size,{width:80,height:10})).toEqual({x:-10,y:-5}));
