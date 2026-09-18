import {it,expect} from 'vitest';
import {parseGridAppearance,DEFAULT_GRID_APPEARANCE,gridColors} from './gridAppearance';
it('preserves saved choices including a hidden grid',()=>expect(parseGridAppearance({opacity:0,palette:'light',majorLines:false})).toEqual({opacity:0,palette:'light',majorLines:false}));
it('bounds opacity',()=>{expect(parseGridAppearance({opacity:4}).opacity).toBe(1);expect(parseGridAppearance({opacity:-2}).opacity).toBe(0);});
it('recovers malformed preferences',()=>{for(const v of [null,'broken',{opacity:NaN,palette:'red',majorLines:'yes'}])expect(parseGridAppearance(v)).toEqual(DEFAULT_GRID_APPEARANCE);});
it('offers contrasting palettes while preserving classic colors',()=>{expect(gridColors('classic')).toEqual({minor:0x2a2d31,major:0x404449,edge:0x6b7280});expect(gridColors('light').minor).not.toBe(gridColors('dark').minor);});
