import {expect,it} from 'vitest';
import {mapHelpPlacement} from './mapHelpPlacement';

it('opens above a low dock and below a high dock',()=>{
  expect(mapHelpPlacement(600,650,720)).toEqual({side:'above',height:360});
  expect(mapHelpPlacement(24,80,393)).toEqual({side:'below',height:196.5});
});
it('uses available space and prefers above when both sides are equal',()=>{
  expect(mapHelpPlacement(110,190,300)).toEqual({side:'above',height:92});
  expect(mapHelpPlacement(0,380,393)).toEqual({side:'above',height:0});
  expect(mapHelpPlacement(1200,1250,1440).height).toBe(380);
});
