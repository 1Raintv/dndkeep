import {describe,it,expect} from 'vitest';
import {showTokenDetail,tokenNameScale} from './tokenDetail';
describe('token detail visibility',()=>{
  it('removes unreadable text at overview zoom',()=>expect(showTokenDetail(.3,false,false)).toBe(false));
  it('restores text at playing scale',()=>expect(showTokenDetail(.65,false,false)).toBe(true));
  it('keeps selected tokens identifiable',()=>expect(showTokenDetail(.2,true,false)).toBe(true));
  it('keeps active-turn details available',()=>expect(showTokenDetail(.2,false,true)).toBe(true));
  it('enlarges a focused name within a fixed cap',()=>{
    expect(tokenNameScale(.9,.5,true)).toBe(1.7);
    expect(tokenNameScale(.9,.1,true)).toBe(2);
  });
  it('preserves normal name fitting when zoomed in or unfocused',()=>{
    expect(tokenNameScale(.9,1,true)).toBe(.9);
    expect(tokenNameScale(.9,.5,false)).toBe(.9);
  });
});
