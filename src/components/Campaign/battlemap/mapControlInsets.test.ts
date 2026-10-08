import {expect,it} from 'vitest';
import {mapControlInsets} from './mapControlInsets';
const host={left:220,right:1280,top:40,bottom:720};
it('leaves horizontal room for the portaled rail independently of bottom combat controls',()=>{
 expect(mapControlInsets(host,[{left:220,right:1280,top:600,bottom:700}],[{left:988,right:1268,top:148,bottom:588}])).toEqual({bottom:132,right:304});
});
it('treats a phone drawer as a bottom obstacle',()=>{
 expect(mapControlInsets({left:0,right:393,top:0,bottom:851},[{left:8,right:385,top:360,bottom:680}],[])).toEqual({bottom:503,right:0});
});
it('ignores hidden, empty and nonoverlapping overlays beside an embedded map',()=>{
 expect(mapControlInsets(host,[{left:0,right:100,top:100,bottom:200},{left:230,right:300,top:900,bottom:950}], [{left:500,right:500,top:100,bottom:700}])).toEqual({bottom:0,right:0});
});
it('restores space when a rail disappears and reserves only its collapsed width',()=>{
 expect(mapControlInsets(host,[],[{left:1224,right:1268,top:148,bottom:588}]).right).toBe(68);
 expect(mapControlInsets(host,[],[])).toEqual({bottom:0,right:0});
});

it('ignores floating controls outside the navigation horizontal space',()=>{
 const side=[{left:988,right:1268,top:148,bottom:588}];
 expect(mapControlInsets(host,[{left:1120,right:1190,top:450,bottom:520},{left:220,right:960,top:600,bottom:700}],side)).toEqual({bottom:132,right:304});
});
it('reads browser rectangle edges even when they are inherited getters',()=>{
 const rect=Object.create({left:0,right:393,top:0,bottom:727}) as typeof host;
 expect(mapControlInsets(rect,[{left:0,right:393,top:520,bottom:727}],[])).toEqual({bottom:219,right:0});
});
