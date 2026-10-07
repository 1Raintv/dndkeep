// @vitest-environment happy-dom
import {renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {useOptimisticCharacterRef} from './useOptimisticCharacterRef';
import type {Character} from '../../types';
it('keeps paid costs through identical-prop rerenders but accepts fresh character state',()=>{
 const c={id:'psion',hit_dice_spent:0} as Character;const {result,rerender}=renderHook(({character})=>useOptimisticCharacterRef(character),{initialProps:{character:c}});
 result.current.current={...c,hit_dice_spent:2};rerender({character:c});expect(result.current.current.hit_dice_spent).toBe(2);
 rerender({character:{...c,hit_dice_spent:3}});expect(result.current.current.hit_dice_spent).toBe(3);
 rerender({character:{...c,id:'other'}});expect(result.current.current.id).toBe('other');
});
