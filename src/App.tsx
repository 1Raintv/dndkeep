import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/shared/Toast';
import { DiceRollProvider } from './context/DiceRollContext';
import { CampaignProvider } from './context/CampaignContext';
import { APP_VERSION } from './version';
import QuickRoll from './components/CharacterSheet/QuickRoll';
import FloatingRollLog from './components/CharacterSheet/FloatingRollLog';

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
  { to: '/homebrew',  label: 'Homebrew',   icon: Icons.homebrew, pro: true },
];

function Sidebar() {
  const { user, profile, isPro } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [homeOpen, setHomeOpen] = useState(true);
  const [characters, setCharacters] = useState<{id:string;name:string;class_name:string;level:number}[]>([]);
  const [campaigns, setCampaigns] = useState<{id:string;name:string}[]>([]);

  useEffect(() => {
    if (!user) return;
    import('./lib/supabase').then(({ supabase }) => {
      supabase.from('characters').select('id,name,class_name,level').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(8)
        .then(({ data }) => { if (data) setCharacters(data as any); });
      supabase.from('campaigns').select('id,name').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(6)
        .then(({ data }) => { if (data) setCampaigns(data as any); });
    });
  }, [user]);

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
        {/* Home with submenu */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <NavLink
              to="/lobby"
              className={({ isActive }) => `sidebar-link ${isActive || location.pathname.startsWith('/character') ? 'active' : ''}`}
              style={{ flex: 1 }}
              title={collapsed ? 'Home' : undefined}
            >
              <span className="sidebar-link-icon">{Icons.characters}</span>
              {!collapsed && <span className="sidebar-link-label">Home</span>}
            </NavLink>
            {!collapsed && (
              <button
                onClick={() => setHomeOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                  color: 'var(--t-3)', fontSize: 12, flexShrink: 0, minHeight: 0,
                  transform: homeOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                title={homeOpen ? 'Collapse' : 'Expand'}
              >›</button>
            )}
          </div>

          {/* Submenu */}
          {!collapsed && homeOpen && (
            <div style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Characters section */}
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--t-3)', padding: '6px 8px 3px', fontFamily: 'var(--ff-body)' }}>Characters</div>
              <NavLink to="/lobby/new" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '4px 8px', minHeight: 0, opacity: 0.7 }}>
                <span style={{ fontSize: 12 }}>＋</span>
                <span className="sidebar-link-label">New Character</span>
              </NavLink>
              {characters.map(c => (
                <NavLink key={c.id} to={`/character/${c.id}`}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  style={{ fontSize: 11, padding: '4px 8px', minHeight: 0 }}>
                  <span className="sidebar-link-icon" style={{ fontSize: 12, width: 16 }}>⚔</span>
                  <span className="sidebar-link-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                    <span style={{ color: 'var(--t-3)', fontWeight: 400, marginLeft: 4 }}>{c.class_name} {c.level}</span>
                  </span>
                </NavLink>
              ))}

              {/* DM Campaigns section */}
              {campaigns.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--t-3)', padding: '6px 8px 3px', fontFamily: 'var(--ff-body)', marginTop: 4 }}>DM Campaigns</div>
                  {campaigns.map(c => (
                    <NavLink key={c.id} to={`/campaigns/${c.id}`}
                      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                      style={{ fontSize: 11, padding: '4px 8px', minHeight: 0 }}>
                      <span className="sidebar-link-icon" style={{ fontSize: 12, width: 16 }}>🗺</span>
                      <span className="sidebar-link-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    </NavLink>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Remaining nav items (Homebrew) */}
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
  const { user, profile } = useAuth();
  const location = useLocation();
  const [activeCharName, setActiveCharName] = useState<string>('');
  const isLanding = !user && location.pathname === '/';
  const isShare = location.pathname.startsWith('/share/');
  const isAuth = location.pathname === '/auth';
  const showSidebar = !isLanding && !isShare && !isAuth && user;

  // Extract characterId from /character/:id and campaignId from /campaigns/:id
  const charMatch = location.pathname.match(/^\/character\/([\w-]+)/);
  const campMatch = location.pathname.match(/^\/campaigns\/([\w-]+)/);
  const activeCharId = charMatch?.[1];
  const activeCampId = campMatch?.[1];

  // Fetch character name when on a character page
  useEffect(() => {
    if (!activeCharId) { setActiveCharName(''); return; }
    import('./lib/supabase').then(({ supabase }) => {
      supabase.from('characters').select('name').eq('id', activeCharId).single()
        .then(({ data }) => { if (data) setActiveCharName(data.name); });
    });
  }, [activeCharId]);

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
      {user && <FloatingRollLog userId={user.id} characterId={activeCharId ?? ''} characterName={activeCharName || profile?.display_name || 'You'} />}
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
