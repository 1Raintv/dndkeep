// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCreatorDraft, readCreatorDraft, writeCreatorDraft } from './creatorDraft';
import { useCreatorDraft } from './useCreatorDraft';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('creator draft lifecycle', () => {
  it('does not overwrite an existing draft until the user chooses Resume or Discard', () => {
    const saved = { ...emptyCreatorDraft(), name: 'Mira', step: 3 };
    writeCreatorDraft(localStorage, 'alice', saved);
    const { result } = renderHook(() => useCreatorDraft('alice'));
    expect(result.current.needsResume).toBe(true);
    expect(readCreatorDraft(localStorage, 'alice')).toEqual(saved);
    act(() => result.current.resume());
    expect(result.current.draft).toEqual(saved);
    act(() => result.current.field('name')('Mira II'));
    expect(readCreatorDraft(localStorage, 'alice')?.name).toBe('Mira II');
  });

  it('preserves multiple field updates and functional setters in one event', () => {
    const { result } = renderHook(() => useCreatorDraft('alice'));
    act(() => {
      result.current.field('name')('Arden');
      result.current.field('species')('Elf');
      result.current.field('step')(value => value + 1);
    });
    expect(readCreatorDraft(localStorage, 'alice')).toMatchObject({ name: 'Arden', species: 'Elf', step: 1 });
  });

  it('clears a completed draft without recreating it on subsequent renders', () => {
    const { result, rerender } = renderHook(() => useCreatorDraft('alice'));
    act(() => result.current.field('name')('Arden'));
    act(() => { expect(result.current.complete()).toBe(true); });
    rerender();
    expect(readCreatorDraft(localStorage, 'alice')).toBeNull();
  });

  it('discards only the current account draft', () => {
    const saved = { ...emptyCreatorDraft(), name: 'Mira' };
    writeCreatorDraft(localStorage, 'alice', saved);
    writeCreatorDraft(localStorage, 'bob', saved);
    const { result } = renderHook(() => useCreatorDraft('alice'));
    act(() => result.current.discard());
    expect(result.current.draft).toEqual(emptyCreatorDraft());
    expect(readCreatorDraft(localStorage, 'alice')).toBeNull();
    expect(readCreatorDraft(localStorage, 'bob')).toEqual(saved);
  });

  it('warns when persistence is unavailable and retains the in-memory form', () => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => null,
      setItem() { throw new Error('quota'); },
      removeItem() {},
    } as unknown as Storage);
    const { result } = renderHook(() => useCreatorDraft('alice'));
    act(() => result.current.field('name')('Arden'));
    expect(result.current.draft.name).toBe('Arden');
    expect(result.current.storageError).toContain('could not be saved');
  });
});
