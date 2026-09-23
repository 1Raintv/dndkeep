// @vitest-environment happy-dom
// v2.746.0 — the chip's rule text is user-visible; pin it to the SRD wording.
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InAreaMark, TargetGroupChip, rowStyleFor } from './TargetGroupChip';

afterEach(cleanup);

it('renders DOWNED and DEAD with SRD-derived titles, and nothing for hostile/ally', () => {
  const { container: down } = render(<TargetGroupChip group="down" />);
  const downEl = down.querySelector('[data-target-group="down"]')!;
  expect(downEl.textContent).toBe('DOWNED');
  expect(downEl.getAttribute('title')).toBe('0 HP — damage at 0 Hit Points causes a Death Saving Throw failure');

  const { container: dead } = render(<TargetGroupChip group="dead" />);
  const deadEl = dead.querySelector('[data-target-group="dead"]')!;
  expect(deadEl.textContent).toBe('DEAD');
  expect(deadEl.getAttribute('title')).toContain("can't regain them unless first revived");

  expect(render(<TargetGroupChip group="hostile" />).container.innerHTML).toBe('');
  expect(render(<TargetGroupChip group="ally" />).container.innerHTML).toBe('');
  expect(render(<TargetGroupChip group="self" />).container.textContent).toBe('YOU');
  expect(render(<InAreaMark />).container.textContent).toBe('IN AREA');
});

it('rowStyleFor dims down/dead rows and out-of-range rows further, never hiding them', () => {
  expect(rowStyleFor('hostile')).toEqual({});
  expect(rowStyleFor('down')).toEqual({ opacity: 0.8 });
  expect(rowStyleFor('dead')).toEqual({ opacity: 0.55 });
  expect(rowStyleFor('hostile', { inRange: false })).toEqual({ opacity: 0.4 });
  expect(rowStyleFor('dead', { inRange: false })).toEqual({ opacity: 0.4 });
  expect(rowStyleFor('dead', { inRange: true })).toEqual({ opacity: 0.55 });
});
