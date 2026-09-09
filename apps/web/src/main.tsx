import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppearanceProvider } from './components/appearance-provider';
import { routeTree } from './routeTree.gen';
import './index.css';

const router = createRouter({
  routeTree,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppearanceProvider>
      <RouterProvider router={router} />
    </AppearanceProvider>
  </StrictMode>,
);
