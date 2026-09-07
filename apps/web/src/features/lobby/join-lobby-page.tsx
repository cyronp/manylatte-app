import { lobbyCodeSchema } from '@app/shared';
import { useNavigate } from '@tanstack/react-router';
import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp';
import { useState, type SubmitEvent } from 'react';

import { Button } from '../../components/ui/button';
import { Field, FieldLabel } from '../../components/ui/field';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '../../components/ui/input-otp';
import { loadLobby } from '../../lib/lobby';
import { LobbyControls } from './lobby-controls';

export function JoinLobbyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const join = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const result = lobbyCodeSchema.safeParse(code);
    if (!result.success) {
      setError('Enter all 8 letters and numbers from your lobby code.');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const lobby = await loadLobby(result.data, new AbortController().signal);
      await navigate({ to: '/', search: { lobby: lobby.code } });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not join this lobby. Please try again.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Join your friends
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter a lobby code or create a space of your own.
          </p>
        </div>
        <form onSubmit={join} className="flex w-full flex-col gap-4">
          <Field className="items-center">
            <FieldLabel htmlFor="join-lobby-code">Lobby code</FieldLabel>
            <InputOTP
              id="join-lobby-code"
              containerClassName="justify-center"
              maxLength={8}
              pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              disabled={pending}
              value={code}
              onChange={(value) => {
                setCode(value.toUpperCase());
                setError(undefined);
              }}
              pasteTransformer={(value) =>
                value.replace(/[\s-]/g, '').toUpperCase()
              }
              aria-invalid={!!error}
              aria-describedby={error ? 'join-lobby-error' : 'join-lobby-hint'}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    aria-invalid={!!error}
                  />
                ))}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[4, 5, 6, 7].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    aria-invalid={!!error}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p id="join-lobby-hint" className="text-xs text-muted-foreground">
              8 letters and numbers, like AB12-CD34
            </p>
          </Field>
          {error && (
            <p
              id="join-lobby-error"
              role="alert"
              className="text-center text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || code.length !== 8}>
            {pending ? 'Joining…' : 'Join lobby'}
          </Button>
        </form>
        <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <LobbyControls />
      </div>
    </main>
  );
}
