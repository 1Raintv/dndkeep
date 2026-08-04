// @vitest-environment jsdom
/**
 * Audit 1.6 regression: roll-overlay labels carry user-controlled text
 * (another player's character name reaches the DM's overlay via
 * ChecksPanel), and DiceRoller3D historically interpolated them into
 * innerHTML — stored XSS in the DM's browser. rollLabelNode must keep
 * that path on textContent so markup arrives inert.
 */
import { describe, it, expect } from 'vitest';
import { rollLabelNode } from './DiceRoller3D';

const PAYLOAD = '<img src=x onerror="window.__pwned=true"><script>window.__pwned=true</script>';

describe('rollLabelNode (audit 1.6)', () => {
  it.each([true, false])('renders markup in a label as inert text (multi=%s)', (multi) => {
    const node = rollLabelNode(PAYLOAD, multi);
    // The payload survives as literal text…
    expect(node.textContent).toBe(PAYLOAD);
    // …and never becomes elements.
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('script')).toBeNull();
    expect(node.children.length).toBe(0);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('escapes when serialized back to HTML', () => {
    expect(rollLabelNode(PAYLOAD, false).innerHTML).toContain('&lt;img');
  });
});
