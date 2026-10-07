// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SpellDescription } from './SpellDescription';
import { SPELL_MAP } from '../../data/spells';
afterEach(cleanup);
it('shows paragraphs, higher-level effects, and exact source links', () => {
  render(<SpellDescription spell={SPELL_MAP['mage-hand']} />);
  expect(screen.getByText(/carry more than 10 pounds/).tagName).toBe('P');
  expect(screen.getByRole('link', { name: /SRD 5.2.1/ }).getAttribute('href')).toContain('#page=145');
  expect(screen.getByRole('link', { name: /Attribution/ }).getAttribute('href')).toBe('/srd');
  cleanup();
  render(<SpellDescription spell={SPELL_MAP.bless} />);
  expect(screen.getByText(/one additional creature/)).toBeTruthy();
});
it('does not claim unreviewed or homebrew text is SRD-licensed', () => {
  render(<SpellDescription spell={{ ...SPELL_MAP.fireball, description: 'Custom text', higher_levels: 'Custom scaling' }} />);
  expect(screen.queryByRole('link', { name: /SRD/ })).toBeNull();
  expect(screen.getByText(/Custom scaling/)).toBeTruthy();
});
