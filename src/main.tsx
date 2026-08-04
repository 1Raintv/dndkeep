import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { APP_VERSION } from './version';
import { attachSink, configuredLevel, consoleSink, installGlobalErrorHooks } from './lib/log';

// v2.406.0 — Boot banner. Helps trace bug reports back to the
// exact deployed version. The console output shows the version
// + timestamp on first load — paste this back when reporting
// problems so we know which build you're running.
// eslint-disable-next-line no-console
console.log(`[DNDKeep] Booted v${APP_VERSION} at ${new Date().toISOString()}`);

// v2.640 audit 2.8 — logging facade + error telemetry. Console sink is
// eager (debug level in dev, info+ in prod); the Supabase error sink
// loads lazily so its weight never touches first paint. Global hooks
// catch what React never sees (uncaught errors, unhandled rejections).
// Verbosity: localStorage 'dndkeep:log:console' / 'dndkeep:log:telemetry'
// (live, per-browser) → VITE_LOG_CONSOLE_LEVEL / VITE_LOG_TELEMETRY_LEVEL
// (per-build) → defaults. 'off' disables a sink entirely.
const consoleLevel = configuredLevel('console', import.meta.env.VITE_LOG_CONSOLE_LEVEL, import.meta.env.DEV ? 'debug' : 'info');
const telemetryLevel = configuredLevel('telemetry', import.meta.env.VITE_LOG_TELEMETRY_LEVEL, 'error');
if (consoleLevel !== 'off') attachSink(consoleSink(consoleLevel));
installGlobalErrorHooks();
if (telemetryLevel !== 'off') {
  void import('./lib/logSinkSupabase').then(m => m.attachSupabaseSink(telemetryLevel)).catch(() => {
    /* telemetry failing to load must never affect the app */
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found. Check index.html.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
