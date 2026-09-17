import {describe,it,expect} from 'vitest';
import {mapResolution} from './mapResolution';
describe('map render density',()=>{
  it('keeps ordinary screens native',()=>expect(mapResolution(1280,720,1)).toBe(1));
  it('renders high density phones at double resolution',()=>expect(mapResolution(393,851,2.75)).toBe(2));
  it('bounds the render buffer on large displays',()=>{
    const density=mapResolution(2560,1440,2);
    expect(density).toBeGreaterThan(1);expect(2560*1440*density*density).toBeCloseTo(8_000_000);
    expect(mapResolution(7680,4320,2)).toBe(1);
  });
  it('handles unavailable density',()=>{expect(mapResolution(800,600,NaN)).toBe(1);expect(mapResolution(800,600,0)).toBe(1);});
});
