import {describe,expect,it} from 'vitest';
import {dragPreviewStyle} from './dragPreviewStyle';
describe('drag preview legibility',()=>{
  it.each([0.12,0.28,1,2,4])('keeps labels and outlines screen-sized at zoom %s',zoom=>{
    const s=dragPreviewStyle(zoom);
    expect(s.labelScale*zoom).toBeCloseTo(1);expect(s.stroke*zoom).toBeCloseTo(2);
    expect(s.dash*zoom).toBeCloseTo(8);expect(s.gap*zoom).toBeCloseTo(6);
  });
  it.each([0,-1,NaN,Infinity])('handles an invalid zoom %s',zoom=>{
    expect(dragPreviewStyle(zoom)).toEqual(dragPreviewStyle(1));
  });
});
