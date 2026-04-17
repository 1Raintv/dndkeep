// No-op PostCSS config (ES module syntax — package.json has "type": "module").
// Tailwind / other PostCSS plugins are not used in this project — all styling
// is inline (`style={{...}}`) or via CSS variables in src/styles/globals.css.
// This file exists only to override an older postcss.config.js that referenced
// 'tailwindcss' (an uninstalled dep), which was silently failing every Vercel
// build. Safe to delete entirely if you'd rather not have a postcss config at all.
export default {};
