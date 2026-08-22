import { createRootRoute, Outlet } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { cursorUsernameSchema } from '@app/shared';

import { SocketProvider } from '../components/socket-provider';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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

  if (!username) {
    return (
      <UsernamePrompt
        onSubmit={(nextUsername) => {
          writeStoredCursorUsername(nextUsername);
          setUsername(nextUsername);
        }}
      />
    );
  }

  return (
    <SocketProvider username={username}>
      <Outlet />
    </SocketProvider>
  );
}

interface UsernamePromptProps {
  onSubmit: (username: string) => void;
}

function UsernamePrompt({ onSubmit }: UsernamePromptProps) {
  const [draft, setDraft] = useState('');
  const [hasError, setHasError] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
            ? 'Enter a username with 1–32 characters, including at least one non-space character.'
            : undefined}
        </FieldError>

        <Button type="submit">Join the board</Button>
      </form>
    </main>
  );
}
