import { expect, it } from 'vitest';
import { savingThrowPassed } from './savingThrows';
it('standard saves use the total even on natural 1 and 20', () => {
  expect(savingThrowPassed(1, 15, 15)).toBe(true);
  expect(savingThrowPassed(20, 20, 21)).toBe(false);
  expect(savingThrowPassed(10, 15, 15)).toBe(true);
  expect(savingThrowPassed(10, 14, 15)).toBe(false);
});
it('preserves the explicit house rule without overriding forced failures', () => {
  expect(savingThrowPassed(1, 15, 15, { naturalExtremes: true })).toBe(false);
  expect(savingThrowPassed(20, 20, 21, { naturalExtremes: true })).toBe(true);
  expect(savingThrowPassed(20, 30, 10, { naturalExtremes: true, forceFailure: true })).toBe(false);
});
