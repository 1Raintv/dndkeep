import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/shared/Toast';
import { DiceRollProvider } from './context/DiceRollContext';
import { CampaignProvider } from './context/CampaignContext';
import { APP_VERSION } from './version';
import QuickRoll from './components/CharacterSheet/QuickRoll';

import './styles/globals.css';

const LandingPage    = lazy(() => import('./components/pages/LandingPage'));
const SrdPage        = lazy(() => import('./components/pages/SrdAttributionPage'));
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

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 'var(--space-3)' }}>
      <div className="spinner" /><span className="loading-text">Loading...</span>
    </div>
  );
}

function CharacterSkeleton() {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div className="skeleton" style={{ width: 56, height: 56, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton skeleton-text lg" style={{ width: '30%' }} />
          <div className="skeleton skeleton-text sm" style={{ width: '50%' }} />
        </div>
      </div>
      {/* HP bar skeleton */}
      <div className="skeleton" style={{ height: 80, marginBottom: 20, borderRadius: 12 }} />
      {/* Ability scores skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        {Array.from({length: 6}).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />
        ))}
      </div>
      {/* Tab bar skeleton */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Array.from({length: 6}).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 32, width: 70, borderRadius: 6 }} />
        ))}
      </div>
      {/* Content skeleton */}
      {Array.from({length: 5}).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" style={{ width: `${70 + Math.random() * 25}%` }} />
      ))}
    </div>
  );
}

// ── SVG Icons ──────────────────────────────────────────────────────
const Icons = {
  characters: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  campaigns: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3,11 22,2 13,21 11,13 3,11"/>
    </svg>
  ),
  spells: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>
    </svg>
  ),
  homebrew: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.58 16.5h12.85"/>
    </svg>
  ),
  dice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>
    </svg>
  ),
  combat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14.5 17.5 3 3a3 3 0 0 0 4-4l-3-3"/><path d="m13 13 4-4"/><path d="m10.5 6.5-2-2a2 2 0 0 0-3 3l2 2"/><path d="m7 7 3 3"/><path d="m4 4 3 3"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
};

const NAV_ITEMS = [
  { to: '/lobby',     label: 'Home',       icon: Icons.characters },
  { to: '/spells',    label: 'Spells',     icon: Icons.spells },
  { to: '/combat',    label: 'Combat',     icon: Icons.combat },
  { to: '/dice',      label: 'Dice',       icon: Icons.dice },
  { to: '/homebrew',  label: 'Homebrew',   icon: Icons.homebrew, pro: true },
];

function Sidebar() {
  const { user, profile, isPro } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <NavLink to="/lobby" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sidebar-logo-icon">⚔</div>
          {!collapsed && <span className="sidebar-logo-text">DNDKeep</span>}
        </NavLink>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
          <span style={{ transform: collapsed ? 'rotate(180deg)' : 'none', display: 'inline-flex', transition: 'transform 200ms' }}>{Icons.chevron}</span>
        </button>
      </div>

      {/* Nav items */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon, pro }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <span className="sidebar-link-icon">{icon}</span>
            {!collapsed && (
              <span className="sidebar-link-label">
                {label}
                {pro && !isPro && <span className="pro-badge">Pro</span>}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: settings + version */}
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          title={collapsed ? 'Account' : undefined}
        >
          <span className="sidebar-link-icon">{Icons.settings}</span>
          {!collapsed && (
            <span className="sidebar-link-label">
              {profile?.display_name ?? (user ? 'Account' : 'Sign In')}
            </span>
          )}
        </NavLink>
        {!collapsed && (
          <div className="sidebar-version">v{APP_VERSION}</div>
        )}
      </div>
    </aside>
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 'var(--space-4)', textAlign: 'center', padding: 'var(--space-8)' }}>
      <div style={{ fontSize: 64, opacity: 0.3 }}>🗺️</div>
      <h2>Page not found</h2>
      <p>This path leads nowhere an adventurer should wander.</p>
      <button className="btn-secondary" onClick={() => navigate('/lobby')}>
        Return to Characters
      </button>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();
  const isLanding = !user && location.pathname === '/';
  const isShare = location.pathname.startsWith('/share/');
  const isAuth = location.pathname === '/auth';
  const showSidebar = !isLanding && !isShare && !isAuth && user;

  // Extract characterId from /character/:id and campaignId from /campaigns/:id
  const charMatch = location.pathname.match(/^\/character\/([\w-]+)/);
  const campMatch = location.pathname.match(/^\/campaigns\/([\w-]+)/);
  const activeCharId = charMatch?.[1];
  const activeCampId = campMatch?.[1];

  return (
    <div className={showSidebar ? 'app-layout-sidebar' : 'app-layout-full'}>
      {showSidebar && <Sidebar />}
      <main className={showSidebar ? 'app-main' : 'app-main-full'}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/share/:token"   element={<SharePage />} />
            <Route path="/"               element={<HomeRedirect />} />
            <Route path="/auth"           element={<AuthPage />} />
            <Route path="/srd"            element={<SrdPage />} />
            <Route path="/lobby"          element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
            <Route path="/creator"        element={<ProtectedRoute><CreatorPage /></ProtectedRoute>} />
            <Route path="/character/:id"  element={<ProtectedRoute><Suspense fallback={<CharacterSkeleton />}><CharacterPage /></Suspense></ProtectedRoute>} />
            <Route path="/campaigns"      element={<Navigate to="/lobby" replace />} />
            <Route path="/campaigns/:id"  element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
            <Route path="/homebrew"       element={<ProtectedRoute><HomebrewPage /></ProtectedRoute>} />
            <Route path="/spells"         element={<ProtectedRoute><SpellsPage /></ProtectedRoute>} />
            <Route path="/combat"         element={<ProtectedRoute><CombatPage /></ProtectedRoute>} />
            <Route path="/dice"           element={<ProtectedRoute><DicePage /></ProtectedRoute>} />
            <Route path="/settings"       element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="*"              element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {/* Global floating dice roller — always visible when logged in */}
      {user && <QuickRoll userId={user.id} characterId={activeCharId} campaignId={activeCampId} />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CampaignProvider>
          <DiceRollProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </DiceRollProvider>
        </CampaignProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
