import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/shared/Toast';
import { ModalProvider } from './components/shared/Modal';
import { DiceRollProvider } from './context/DiceRollContext';
import { ScreenFlashProvider } from './context/ScreenFlashContext';
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
const MagicItemsPage = lazy(() => import('./components/pages/MagicItemsPage'));
const CombatPage     = lazy(() => import('./components/pages/CombatPage'));
const HomebrewPage   = lazy(() => import('./components/pages/HomebrewPage'));
const BestiaryPage   = lazy(() => import('./components/pages/BestiaryPage'));
const ClassCompendiumPage = lazy(() => import('./components/pages/ClassCompendiumPage'));
const DicePage       = lazy(() => import('./components/pages/DicePage'));
const SettingsPage   = lazy(() => import('./components/pages/SettingsPage'));
const AuthPage       = lazy(() => import('./components/pages/AuthPage'));
const CreatorPage    = lazy(() => import('./components/CharacterCreator'));
const CampaignsPage  = lazy(() => import('./components/pages/CampaignsPage'));

// v2.284.0 — Last-route memory + cross-tab version detection.
//
// LAST-ROUTE MEMORY: opening DNDKeep in a new tab (or hitting "/")
// after a session has been going routes the user back to where they
// were last working — their campaign, their character page, etc. —
// instead of dumping them on the lobby every time. The stored path
// is validated against PERSISTABLE_ROUTE_RE so we don't accidentally
// route through a /share/:token or /auth flow on the next visit.
//
// CROSS-TAB VERSION DETECTION: when a user opens a fresh tab on a
// new deploy, the new tab writes its APP_VERSION to localStorage.
// Older tabs of the same browser receive a `storage` event with the
// new value and know they're stale; they show a banner prompting a
// reload. Tabs are notified via the standard storage-event mechanism
// (which only fires on OTHER tabs in the same origin), so the writer
// never races itself.
const LAST_ROUTE_KEY = 'dndkeep:last-route';
const APP_VERSION_KEY = 'dndkeep:app-version';

// Whitelist of paths that are safe to remember as a "last route".
// Anything not matching falls through and the redirect goes to /lobby.
// Excluded by design:
//   - "/" itself (would create a fixed-point loop)
//   - "/auth", "/share/:token", "/" (transient / share-public flows)
//   - "/creator" (mid-flow; better to dump back to lobby)
const PERSISTABLE_ROUTE_RE = /^\/(lobby|campaigns(\/[\w-]+)?|character\/[\w-]+|homebrew|bestiary|compendium(\/[\w-]+)?|spells|magic-items|combat|dice|settings|srd)\/?$/;

function loadLastRoute(): string | null {
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY);
    if (stored && PERSISTABLE_ROUTE_RE.test(stored.split('?')[0])) return stored;
  } catch { /* ignore — quota, privacy mode, etc. */ }
  return null;
}

function useLastRouteMemory() {
  const location = useLocation();
  useEffect(() => {
    if (PERSISTABLE_ROUTE_RE.test(location.pathname)) {
      try {
        localStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
      } catch { /* ignore */ }
    }
  }, [location.pathname, location.search]);
}

function useCrossTabVersionDetection(): { staleVersion: string | null } {
  const [staleVersion, setStaleVersion] = useState<string | null>(null);
  useEffect(() => {
    // On boot: stamp our version. If another tab boots later with a
    // newer version, this tab's `storage` listener below will fire
    // with the new value and we'll know we're stale.
    try { localStorage.setItem(APP_VERSION_KEY, APP_VERSION); } catch { /* ignore */ }
    function onStorage(e: StorageEvent) {
      if (e.key === APP_VERSION_KEY && e.newValue && e.newValue !== APP_VERSION) {
        setStaleVersion(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return { staleVersion };
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 'var(--space-3)' }}>
      <div className="spinner" /><span className="loading-text">Loading…</span>
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
  bestiary: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
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
  { to: '/bestiary',  label: 'Bestiary',   icon: Icons.bestiary },
  { to: '/spells',    label: 'Spells',     icon: '✨' },
  // v2.159.0 — Phase P pt 7: Magic Items browser. Lives between
  // Spells and Classes to group the three "canonical reference"
  // pages together.
  { to: '/magic-items', label: 'Magic Items', icon: '🧪' },
  { to: '/homebrew',  label: 'Homebrew',   icon: Icons.homebrew, pro: true },
  { to: '/compendium', label: 'Classes & Subclasses', icon: '📖' },
];

function Sidebar() {
  const { user, profile, isPro } = useAuth();
  // v2.230 — `location` was previously used to mark Home active when
  // viewing a character; the new sidebar treats Home and individual
  // characters as distinct nav targets, so location-based active
  // matching is unnecessary.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dndkeep:sidebar-collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('dndkeep:sidebar-collapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);
  const [characters, setCharacters] = useState<{id:string;name:string;class_name:string;level:number}[]>([]);
  const [campaigns, setCampaigns] = useState<{id:string;name:string}[]>([]);

  useEffect(() => {
    if (!user) return;
    import('./lib/supabase').then(({ supabase }) => {
      supabase.from('characters').select('id,name,class_name,level').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20)  // up to 6 base + extra slots
        .then(({ data }) => { if (data) setCharacters(data as any); });
      supabase.from('campaigns').select('id,name').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(6)
        .then(({ data }) => { if (data) setCampaigns(data as any); });
    });
  }, [user]);

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        {!collapsed && (
          <NavLink to="/lobby" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="sidebar-logo-icon">⚔</div>
            <span className="sidebar-logo-text">DNDKeep</span>
          </NavLink>
        )}
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
          <span style={{ transform: collapsed ? 'rotate(180deg)' : 'none', display: 'inline-flex', transition: 'transform 200ms' }}>{Icons.chevron}</span>
        </button>
      </div>

      {/* Nav items */}
      <nav className="sidebar-nav">
        {/* Home — top-level, full prominence. Path activeness covers
            both /lobby and any /character/:id (since "Home" is where
            you go to manage characters and create new ones). */}
        <NavLink
          to="/lobby"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          title={collapsed ? 'Home' : undefined}
        >
          <span className="sidebar-link-icon">{Icons.characters}</span>
          {!collapsed && <span className="sidebar-link-label">Home</span>}
        </NavLink>

        {/* v2.230 — three structured sections: Characters, DM Campaigns,
            Library. Each has a prominent uppercase header with a divider
            line so they read as proper sections, not afterthoughts. The
            previous "+ New Character" entry was removed — character
            creation lives on the Home page. */}

        {/* Characters section. Always shown when expanded so users see
            "you have no characters yet — go to Home to make one"
            implicitly, instead of an empty header. If there are no
            characters AND no campaigns, the sections still render so
            the sidebar feels structured. */}
        {!collapsed && (
          <>
            <div className="sidebar-section-header">
              <span>Characters</span>
              <span className="sidebar-section-header-line" />
            </div>
            {characters.length === 0 ? (
              <div style={{
                padding: '6px 12px', fontSize: 'var(--fs-xs)',
                color: 'var(--t-3)', fontStyle: 'italic',
              }}>
                No characters yet
              </div>
            ) : (
              characters.map(c => (
                <NavLink key={c.id} to={`/character/${c.id}`}
                  className={({ isActive }) => `sidebar-link sidebar-link-sub ${isActive ? 'active' : ''}`}
                >
                  <span className="sidebar-link-icon" style={{ fontSize: 12, width: 16 }}>⚔</span>
                  <span className="sidebar-link-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                    <span style={{ color: 'var(--t-3)', fontWeight: 400, marginLeft: 4 }}>{c.class_name} {c.level}</span>
                  </span>
                </NavLink>
              ))
            )}
          </>
        )}

        {/* DM Campaigns section — only renders if the user has any
            campaigns (otherwise the section header would feel like
            empty noise). Players with no DM campaigns just see
            Characters → Library. */}
        {!collapsed && campaigns.length > 0 && (
          <>
            <div className="sidebar-section-header">
              <span>DM Campaigns</span>
              <span className="sidebar-section-header-line" />
            </div>
            {campaigns.map(c => (
              <NavLink key={c.id} to={`/campaigns/${c.id}`}
                className={({ isActive }) => `sidebar-link sidebar-link-sub ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-link-icon" style={{ fontSize: 12, width: 16 }}>🗺</span>
                <span className="sidebar-link-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </NavLink>
            ))}
          </>
        )}

        {/* Library section — reference content (Bestiary, Spells, Magic
            Items, Homebrew, Classes & Subclasses). Previously these
            free-floated at the bottom of the nav with no grouping.
            Now they're grouped under a prominent header that matches
            the visual weight of the Characters / DM Campaigns headers. */}
        {!collapsed && (
          <div className="sidebar-section-header">
            <span>Library</span>
            <span className="sidebar-section-header-line" />
          </div>
        )}
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
  if (user) {
    // v2.284.0 — opening DNDKeep in a new tab (or refreshing "/")
    // routes back to the last persisted location instead of
    // unconditionally /lobby. PERSISTABLE_ROUTE_RE in loadLastRoute
    // is the source of truth for what's a valid stored path; if it
    // returns null we fall through to /lobby.
    const last = loadLastRoute();
    return <Navigate to={last ?? '/lobby'} replace />;
  }
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

  // v2.284.0 — persist the last-visited path on every navigation
  // (whitelisted to PERSISTABLE_ROUTE_RE in the hook itself), and
  // listen for cross-tab version writes so this tab can surface a
  // "new version" banner if a fresher deploy is open elsewhere.
  useLastRouteMemory();
  const { staleVersion } = useCrossTabVersionDetection();

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
      {/* v2.284.0 — Cross-tab version banner. Renders only when a
          newer tab has stamped a different APP_VERSION into
          localStorage during this session. zIndex above the combat
          strip (9999) and toasts so it's never buried; click → hard
          reload picks up the fresh code. The banner is sticky
          (no auto-dismiss) because dismissing it without reloading
          would leave the tab in an inconsistent state — stale code
          talking to a possibly-newer DB schema. */}
      {staleVersion && (
        <div
          role="alert"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            zIndex: 100000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12,
            padding: '8px 14px',
            background: 'linear-gradient(180deg, rgba(212,160,23,0.98) 0%, rgba(180,135,18,0.98) 100%)',
            color: '#1a1410',
            fontFamily: 'var(--ff-body)',
            fontSize: 13, fontWeight: 700,
            letterSpacing: '0.02em',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        >
          <span>
            New version available (v{staleVersion}). Reload to update.
          </span>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '4px 12px',
              background: '#1a1410',
              color: 'var(--c-gold-l, #f5d875)',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'var(--ff-body)',
              fontWeight: 700, fontSize: 12,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )}
      {showSidebar && <Sidebar />}
      <main className={showSidebar ? 'app-main' : 'app-main-full'}>
        {/* Mobile bottom nav — phones only */}
        <nav className="mobile-bottom-nav">
          <NavLink to="/lobby" style={({isActive})=>({display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:isActive?'var(--c-gold)':'var(--t-3)',textDecoration:'none',fontSize:10,fontFamily:'var(--ff-body)',fontWeight:700,padding:'4px 8px'})}>
            <span style={{fontSize:20}}>🏠</span>Home
          </NavLink>
          <NavLink to="/lobby/new" style={({isActive})=>({display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:isActive?'var(--c-gold)':'var(--t-3)',textDecoration:'none',fontSize:10,fontFamily:'var(--ff-body)',fontWeight:700,padding:'4px 8px'})}>
            <span style={{fontSize:20}}>✚</span>New
          </NavLink>
          <NavLink to="/spells" style={({isActive})=>({display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:isActive?'var(--c-gold)':'var(--t-3)',textDecoration:'none',fontSize:10,fontFamily:'var(--ff-body)',fontWeight:700,padding:'4px 8px'})}>
            <span style={{fontSize:20}}>✨</span>Spells
          </NavLink>
          <NavLink to="/homebrew" style={({isActive})=>({display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:isActive?'var(--c-gold)':'var(--t-3)',textDecoration:'none',fontSize:10,fontFamily:'var(--ff-body)',fontWeight:700,padding:'4px 8px'})}>
            <span style={{fontSize:20}}>📖</span>Brew
          </NavLink>
          <NavLink to="/settings" style={({isActive})=>({display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:isActive?'var(--c-gold)':'var(--t-3)',textDecoration:'none',fontSize:10,fontFamily:'var(--ff-body)',fontWeight:700,padding:'4px 8px'})}>
            <span style={{fontSize:20}}>⚙️</span>Settings
          </NavLink>
        </nav>
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
            <Route path="/bestiary"       element={<ProtectedRoute><BestiaryPage /></ProtectedRoute>} />
            <Route path="/compendium"            element={<ProtectedRoute><Suspense fallback={<div style={{padding:32,color:'var(--t-3)'}}>Loading...</div>}><ClassCompendiumPage /></Suspense></ProtectedRoute>} />
            <Route path="/compendium/:className" element={<ProtectedRoute><Suspense fallback={<div style={{padding:32,color:'var(--t-3)'}}>Loading...</div>}><ClassCompendiumPage /></Suspense></ProtectedRoute>} />
            <Route path="/spells"         element={<ProtectedRoute><SpellsPage /></ProtectedRoute>} />
            <Route path="/magic-items"    element={<ProtectedRoute><MagicItemsPage /></ProtectedRoute>} />
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
            <ScreenFlashProvider>
              <ToastProvider>
                <ModalProvider>
                  <AppRoutes />
                </ModalProvider>
              </ToastProvider>
            </ScreenFlashProvider>
          </DiceRollProvider>
        </CampaignProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
