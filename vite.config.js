import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup-vitest.js',
    css: false,
    include: ['tests/**/*.test.jsx'],
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  resolve: {
    alias: {
      '@docusaurus/Link': path.resolve(__dirname, 'src/app/CompatLink.js'),
      '@theme/Layout': path.resolve(__dirname, 'src/app/AppLayout.js'),
    },
  },
});
