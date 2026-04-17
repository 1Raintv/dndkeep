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
        },
      },
    },
    // Bumped from default 500 KB — three+cannon together are intentionally chunky.
    chunkSizeWarningLimit: 700,
  },
});
