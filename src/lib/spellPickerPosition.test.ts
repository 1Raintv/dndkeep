import {expect,it} from 'vitest';
import {spellPickerPosition} from './spellPickerPosition';
it('opens below a desktop trigger when the whole picker fits',()=>{
 expect(spellPickerPosition({left:100,bottom:80},{width:1280,height:900})).toEqual({left:100,top:84,width:480,maxHeight:500});
});
it.each([{width:393,height:727},{width:320,height:400},{width:1280,height:800}])('keeps a bottom/right trigger popup inside %j',viewport=>{
 const pos=spellPickerPosition({left:viewport.width-30,bottom:viewport.height-10},viewport);
 expect(pos.left).toBeGreaterThanOrEqual(12);expect(pos.top).toBeGreaterThanOrEqual(12);
 expect(pos.left+pos.width).toBeLessThanOrEqual(viewport.width-12);
 expect(pos.top+pos.maxHeight).toBeLessThanOrEqual(viewport.height-12);
});
