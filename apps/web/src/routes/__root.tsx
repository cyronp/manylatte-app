import { createRootRoute, Outlet } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { cursorUsernameSchema } from '@app/shared';

import { SocketProvider } from '../components/socket-provider';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export const Route = createRootRoute({
  component: RootLayout,
});

const USERNAME_STORAGE_KEY = 'manylatte:username';

const getStoredUsername = () => {
  try {
    const storedUsername = window.localStorage.getItem(USERNAME_STORAGE_KEY);
    const result = storedUsername
      ? cursorUsernameSchema.safeParse(storedUsername)
      : undefined;
    return result?.success ? result.data : '';
  } catch {
    return '';
  }
};

function RootLayout() {
  const [username, setUsername] = useState(getStoredUsername);

  if (!username) {
    return (
      <UsernamePrompt
        onSubmit={(nextUsername) => {
          try {
            window.localStorage.setItem(USERNAME_STORAGE_KEY, nextUsername);
          } catch {}
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
              autoFocus
              maxLength={32}
              onChange={(event) => {
                setDraft(event.target.value);
                setHasError(false);
              }}
              placeholder="John Doe"
              value={draft}
            />
          </FieldLabel>
        </Field>

        {hasError && (
          <p className="text-sm text-rose-600" role="alert">
            Enter a username with 1–32 characters.
          </p>
        )}

        <Button type="submit">Join the board</Button>
      </form>
    </main>
  );
}
