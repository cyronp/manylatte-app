import path from 'node:path';
import { resolveCursorApiUrl } from './src/lib/api-environment.ts';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  resolveCursorApiUrl({
    ...loadEnv(mode, process.cwd(), 'VITE_'),
    PROD: mode === 'production',
  });
  const environment = loadEnv(mode, process.cwd(), 'DEV_SERVER_');
  const allowedHosts = environment.DEV_SERVER_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    build: { assetsInlineLimit: 0 },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    server: {
      allowedHosts: allowedHosts ?? [],
      host: environment.DEV_SERVER_HOST || '127.0.0.1',
    },
  };
});
