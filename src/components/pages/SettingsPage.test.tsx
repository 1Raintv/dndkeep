// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), signOut: vi.fn(), loading: false }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'a' }, profile: null, profileLoading: mocks.loading, refreshProfile: mocks.refresh,
}) }));
vi.mock('../../lib/supabase', () => ({ signOut: mocks.signOut, getCharacters: async () => ({ data: [] }),
  deleteCharacter: vi.fn(), exportMyData: vi.fn(), deleteMyAccount: vi.fn() }));
vi.mock('../../lib/stripe', () => ({ STRIPE_PRICES: {}, redirectToCheckout: vi.fn(), redirectToCustomerPortal: vi.fn(), redirectToOneTimeCheckout: vi.fn() }));
vi.mock('../../lib/usePushNotifications', () => ({ usePushNotifications: () => ({}) }));
vi.mock('../../lib/useHouseRules', () => ({ useHouseRules: () => [{}, vi.fn()] }));
import SettingsPage from './SettingsPage';
beforeEach(() => { vi.clearAllMocks(); mocks.loading = false; mocks.signOut.mockResolvedValue({ error: null }); });
afterEach(cleanup);
const show = () => render(<MemoryRouter><SettingsPage /></MemoryRouter>);
it('offers retry and sign-out when no profile exists', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Retry account' }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
});
it('keeps sign-out available during profile loading and reports failure', async () => {
  mocks.loading = true;
  mocks.signOut.mockResolvedValue({ error: new Error('offline') });
  show();
  expect((screen.getByRole('button', { name: 'Retry account' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not sign out'));
});
