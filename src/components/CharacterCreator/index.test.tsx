// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'creator-test' }, profile: null }),
}));
// This is the entire backend. Rendering and submitting must never touch a DB.
vi.mock('../../lib/supabase', () => ({ createCharacter: vi.fn(), supabase: {} }));
import { createCharacter } from '../../lib/supabase';
import CharacterCreator from './index';
import { emptyCreatorDraft, readCreatorDraft, writeCreatorDraft } from './creatorDraft';

beforeEach(() => { localStorage.clear(); vi.mocked(createCharacter).mockReset(); });
afterEach(cleanup);

function renderCreator() {
  return render(<MemoryRouter initialEntries={['/creator']}>
    <Routes>
      <Route path="/creator" element={<CharacterCreator />} />
      <Route path="/character/:id" element={<p>Character created successfully</p>} />
    </Routes>
  </MemoryRouter>);
}

describe('creator recovery in the real wizard', () => {
  it('restores typed input after leaving and remounting the wizard', () => {
    const first = renderCreator();
    fireEvent.change(screen.getByPlaceholderText('What do they call you?'), { target: { value: 'Mira' } });
    first.unmount();
    renderCreator();
    expect(screen.getByRole('heading', { name: 'Continue your character?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume character' }));
    expect((screen.getByPlaceholderText('What do they call you?') as HTMLInputElement).value).toBe('Mira');
  });

  it('keeps a review draft after a failed submission and clears it only after success', async () => {
    const saved = { ...emptyCreatorDraft(), name: 'Mira', species: 'Elf', className: 'Fighter', background: 'Soldier', step: 5 };
    writeCreatorDraft(localStorage, 'creator-test', saved);
    vi.mocked(createCharacter).mockRejectedValueOnce(new Error('Disconnected'));
    renderCreator();
    fireEvent.click(screen.getByRole('button', { name: 'Resume character' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Character' }));
    await screen.findByText('Could not create your character. Check your connection and try again.');
    expect(readCreatorDraft(localStorage, 'creator-test')?.name).toBe('Mira');
    vi.mocked(createCharacter).mockResolvedValueOnce({ data: { id: 'created' }, error: null } as Awaited<ReturnType<typeof createCharacter>>);
    fireEvent.click(screen.getByRole('button', { name: 'Create Character' }));
    await screen.findByText('Character created successfully');
    await waitFor(() => expect(readCreatorDraft(localStorage, 'creator-test')).toBeNull());
  });
});
