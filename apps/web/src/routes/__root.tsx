import { createRootRoute, Outlet } from '@tanstack/react-router';
import { type SubmitEvent, useState } from 'react';
import { cursorUsernameSchema } from '@app/shared';

import { SocketProvider } from '../components/socket-provider';
import UserMenu from '../components/user-menu/user-menu';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  readStoredCursorUsername,
  writeStoredCursorUsername,
} from '@/lib/username-storage';

export const Route = createRootRoute({
  component: RootLayout,
});

const USERNAME_ERROR_ID = 'username-error';

function RootLayout() {
  const [username, setUsername] = useState(readStoredCursorUsername);

  return (
    <TooltipProvider>
      {!username ? (
        <UsernamePrompt
          onSubmit={(nextUsername) => {
            writeStoredCursorUsername(nextUsername);
            setUsername(nextUsername);
          }}
        />
      ) : (
        <SocketProvider username={username}>
          <div className="relative min-h-screen bg-background">
            <div className="absolute top-4 right-4 z-50">
              <UserMenu
                onUsernameChange={(nextUsername) => {
                  writeStoredCursorUsername(nextUsername);
                  setUsername(nextUsername);
                }}
                username={username}
              />
            </div>
            <Outlet />
          </div>
        </SocketProvider>
      )}
    </TooltipProvider>
  );
}

interface UsernamePromptProps {
  onSubmit: (username: string) => void;
}

function UsernamePrompt({ onSubmit }: UsernamePromptProps) {
  const [draft, setDraft] = useState('');
  const [hasError, setHasError] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = cursorUsernameSchema.safeParse(draft);

    if (!result.success) {
      setHasError(true);
      return;
    }

    onSubmit(result.data);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        className="flex w-full max-w-sm flex-col gap-4 p-6"
        onSubmit={handleSubmit}
      >
        <Field>
          <FieldLabel className="flex flex-col items-start">
            Username
            <Input
              aria-describedby={hasError ? USERNAME_ERROR_ID : undefined}
              aria-invalid={hasError}
              autoFocus
              autoComplete="nickname"
              id="username"
              maxLength={32}
              name="username"
              onChange={(event) => {
                setDraft(event.target.value);
                setHasError(false);
              }}
              placeholder="John Doe"
              value={draft}
            />
          </FieldLabel>
        </Field>

        <FieldError id={USERNAME_ERROR_ID}>
          {hasError
            ? 'Enter 1–32 visible characters without control or directional formatting characters.'
            : undefined}
        </FieldError>

        <Button type="submit">Join the board</Button>
      </form>
    </main>
  );
}
