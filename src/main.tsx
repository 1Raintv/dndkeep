import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './version';

// v2.406.0 — Boot banner. Helps trace bug reports back to the
// exact deployed version. The console output shows the version
// + timestamp on first load — paste this back when reporting
// problems so we know which build you're running.
// eslint-disable-next-line no-console
console.log(`[DNDKeep] Booted v${APP_VERSION} at ${new Date().toISOString()}`);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found. Check index.html.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
