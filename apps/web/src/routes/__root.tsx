import { createRootRoute, Outlet } from '@tanstack/react-router';

import { SocketProvider } from '../components/socket-provider';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <SocketProvider>
      <Outlet />
    </SocketProvider>
  );
}
