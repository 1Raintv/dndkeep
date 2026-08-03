import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js + physics — heavy, only loaded when rolling dice.
          // Splitting them to their own chunk lets the browser cache them
          // separately from app code (so app updates don't invalidate them).
          'dice-engine': ['three', 'cannon-es'],
          // React core — large, very stable across releases.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client — also stable, used everywhere.
          'supabase': ['@supabase/supabase-js'],
          // PixiJS renderer + viewport — heavy, only loaded with the battle
          // map. Same caching rationale as dice-engine: pixi upgrades are
          // rare, so app-code deploys shouldn't invalidate this chunk.
          'pixi': ['pixi.js', 'pixi-viewport'],
        },
      },
    },
    // Bumped from default 500 KB — three+cannon together are intentionally chunky.
    chunkSizeWarningLimit: 700,
  },
});
