import { spawnSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED   = '\x1b[31m';
const RESET = '\x1b[0m';

function log(msg)  { console.log(`${CYAN}▶${RESET} ${msg}`); }
function ok(msg)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.error(`${RED}✗${RESET} ${msg}`); process.exit(1); }

function run(cmd, label) {
  log(label);
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) fail(`Failed: ${label}`);
}

console.log('\n🎲  DNDKeep Setup\n');

if (!existsSync('package.json')) {
  fail('Run this script from inside the dndkeep folder — the folder that contains package.json');
}

const envContent = `VITE_SUPABASE_URL=https://ufowdrspkprlpdnjjkaj.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmb3dkcnNwa3BybHBkbmpqa2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjAzMTgsImV4cCI6MjA5MDI5NjMxOH0.Rx_H2CuFLql4VoNKxTrpKJ61HXLXp1I1DUHe4XPCFqQ
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
VITE_STRIPE_PRO_MONTHLY_PRICE_ID=price_placeholder
VITE_APP_URL=https://dndkeep.vercel.app
`;

writeFileSync('.env.local', envContent);
ok('.env.local created with your Supabase credentials');

run('npm install --legacy-peer-deps', 'Installing dependencies (1-2 minutes)...');
ok('Dependencies installed');

console.log(`
${YELLOW}Vercel login${RESET}
──────────────────────────────────────────
A browser window will open — log in to Vercel (free).
Come back here when done. Everything else is automatic.
──────────────────────────────────────────
`);

run('npx vercel --yes --prod', 'Deploying to Vercel...');

console.log(`
${GREEN}════════════════════════════════════════
  DNDKeep is live!
════════════════════════════════════════${RESET}

Your live URL is shown above (ends in .vercel.app)
Database is already connected and ready to go.

To run locally:    npm run dev
To redeploy:       npx vercel --prod
`);
