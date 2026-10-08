import {describe,it,expect} from 'vitest';
import {artworkLayout,artworkRaster} from './artworkLayout';
describe('artwork sizing',()=>{
  it('fits a wide image with centred padding',()=>expect(artworkLayout(400,200,300,300,'contain')).toEqual({x:0,y:75,width:300,height:150,scale:.75}));
  it('fills without distortion by cropping',()=>expect(artworkLayout(400,200,300,300,'cover')).toEqual({x:-150,y:0,width:600,height:300,scale:1.5}));
  it('fits tall artwork',()=>expect(artworkLayout(200,400,300,300,'contain')).toEqual({x:75,y:0,width:150,height:300,scale:.75}));
  it('keeps matching artwork unchanged',()=>expect(artworkLayout(300,300,300,300,'contain').scale).toBe(1));
  it('bounds export memory while preserving aspect',()=>{
    const r=artworkRaster(14000,7000);expect(r.width).toBeLessThanOrEqual(4096);
    expect(r.width*r.height).toBeLessThan(8_010_000);expect(r.width/r.height).toBeCloseTo(2,2);
    expect(artworkRaster(700,700)).toEqual({width:700,height:700});
  });
  it('rejects invalid dimensions',()=>{
    expect(()=>artworkLayout(0,200,300,300,'contain')).toThrow();
    expect(()=>artworkRaster(Infinity,700)).toThrow();
  });
  it('retains high-resolution detail instead of baking a small scene at screen resolution',()=>{
    expect(artworkRaster(700,700,{width:2400,height:1200},'contain')).toEqual({width:2400,height:2400});
    expect(artworkRaster(700,700,{width:2400,height:1200},'cover')).toEqual({width:1200,height:1200});
  });
  it('keeps the memory ceiling for very large originals and preserves map proportions',()=>{
    for(const fit of ['contain','cover'] as const){
      const r=artworkRaster(1400,700,{width:20000,height:10000},fit);
      expect(r.width).toBeLessThanOrEqual(4096);expect(r.height).toBeLessThanOrEqual(4096);
      expect(r.width*r.height).toBeLessThan(8_010_000);expect(r.width/r.height).toBeCloseTo(2,2);
    }
  });
  it('does not manufacture extra density from a low-resolution original',()=>{
    expect(artworkRaster(700,700,{width:400,height:200})).toEqual({width:700,height:700});
  });
  it('rejects malformed source dimensions before preparing an export',()=>{
    expect(()=>artworkRaster(700,700,{width:0,height:100})).toThrow();
    expect(()=>artworkRaster(700,700,{width:100,height:NaN})).toThrow();
  });

});
