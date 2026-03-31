import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/shared/Toast';
import { DiceRollProvider } from './context/DiceRollContext';
import { APP_VERSION } from './version';
import './styles/globals.css';

const LandingPage    = lazy(() => import('./components/pages/LandingPage'));
const LobbyPage      = lazy(() => import('./components/pages/LobbyPage'));
const SharePage      = lazy(() => import('./components/pages/SharePage'));
const CharacterPage  = lazy(() => import('./components/pages/CharacterPage'));
const SpellsPage     = lazy(() => import('./components/pages/SpellsPage'));
const CombatPage     = lazy(() => import('./components/pages/CombatPage'));
const HomebrewPage   = lazy(() => import('./components/pages/HomebrewPage'));
const DicePage       = lazy(() => import('./components/pages/DicePage'));
const SettingsPage   = lazy(() => import('./components/pages/SettingsPage'));
const AuthPage       = lazy(() => import('./components/pages/AuthPage'));
const CreatorPage    = lazy(() => import('./components/CharacterCreator'));
const CampaignsPage  = lazy(() => import('./components/pages/CampaignsPage'));

const NAV_LINKS = [
  { to: '/lobby',     label: 'Characters' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/spells',    label: 'Spells' },
  { to: '/homebrew',  label: '⚗️ Homebrew' },
  { to: '/combat',    label: 'Combat' },
  { to: '/dice',      label: 'Dice' },
];

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 'var(--space-3)' }}>
      <div className="spinner" /><span className="loading-text">Loading...</span>
    </div>
  );
}

function Nav() {
  const { user, profile, isPro } = useAuth();

  return (
    <nav className="app-nav">
      <NavLink to="/lobby" style={{ textDecoration: 'none' }}>
        <span className="app-logo">DNDKeep</span>
      </NavLink>

      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {NAV_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {label}
            {to === '/campaigns' && !isPro && (
              <span style={{
                fontSize: 9,
                background: 'rgba(212,160,23,0.2)',
                color: 'var(--color-gold-bright)',
                padding: '1px 5px',
                borderRadius: 999,
                border: '1px solid rgba(212,160,23,0.3)',
                letterSpacing: '0.06em',
                fontWeight: 700,
              }}>
                PRO
              </span>
            )}
          </NavLink>
        ))}

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          {profile?.display_name ?? (user ? 'Account' : 'Sign In')}
        </NavLink>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/auth', { replace: true });
  }, [user, loading, navigate]);

  if (loading) return <PageLoader />;
  if (!user) return null;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/lobby" replace />;
  return <LandingPage />;
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 'var(--space-4)', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', color: 'var(--text-gold)', opacity: 0.4 }}>404</div>
      <h2 style={{ color: 'var(--text-muted)' }}>Page not found</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        This path leads nowhere a adventurer should wander.
      </p>
      <button className="btn-secondary" onClick={() => navigate('/lobby')}>
        Return to Characters
      </button>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  const isLanding = !user && window.location.pathname === '/';
  const isShare = window.location.pathname.startsWith('/share/');
  const hideNav = isLanding || isShare;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!hideNav && <Nav />}
      <main className={hideNav ? '' : 'app-content'}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/share/:token"   element={<SharePage />} />
            <Route path="/"                element={<HomeRedirect />} />
            <Route path="/auth"            element={<AuthPage />} />
            <Route path="/lobby"           element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
            <Route path="/creator"         element={<ProtectedRoute><CreatorPage /></ProtectedRoute>} />
            <Route path="/character/:id"   element={<ProtectedRoute><CharacterPage /></ProtectedRoute>} />
            <Route path="/campaigns"       element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
            <Route path="/campaigns/:id"   element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
            <Route path="/homebrew"        element={<ProtectedRoute><HomebrewPage /></ProtectedRoute>} />
            <Route path="/spells"          element={<ProtectedRoute><SpellsPage /></ProtectedRoute>} />
            <Route path="/combat"          element={<ProtectedRoute><CombatPage /></ProtectedRoute>} />
            <Route path="/dice"            element={<ProtectedRoute><DicePage /></ProtectedRoute>} />
            <Route path="/settings"        element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="*"               element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      {/* Version badge — fixed bottom right */}
      <div style={{
        position: 'fixed',
        bottom: 'var(--space-3)',
        right: 'var(--space-3)',
        zIndex: 9999,
        fontFamily: 'var(--font-heading)',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        background: 'rgba(13,11,9,0.7)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '2px 7px',
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        v{APP_VERSION} · <span style={{ opacity: 0.6 }}>T=rest I=inspiration</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DiceRollProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
        </DiceRollProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
