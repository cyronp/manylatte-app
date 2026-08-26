import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'DEV_SERVER_');
  const allowedHosts = environment.DEV_SERVER_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
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
