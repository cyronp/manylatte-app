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
import { DecorativeCursors } from './decorative-cursors';

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
    <main
      className="relative isolate flex min-h-screen items-center justify-center bg-background px-4 py-8"
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--canvas-grid) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
      }}
    >
      <DecorativeCursors />
      <div className="relative z-20 flex w-full max-w-120 flex-col items-center gap-8 rounded-2xl border border-border bg-background/95 px-6 py-16 shadow sm:px-10">
        <div className="flex flex-col gap-4 items-center justify-center">
          <h1 className="text-5xl font-bold">ManyLatte</h1>
          <p className="text-sm text-muted-foreground">
            Enter a lobby code or create a space of your own.
          </p>
        </div>
        <form
          onSubmit={join}
          className="flex w-full max-w-lg flex-col justify-center gap-6"
        >
          <Field className="items-center">
            <FieldLabel className="text-base" htmlFor="join-lobby-code">
              Lobby code
            </FieldLabel>
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
                    className="h-12 w-9 text-base sm:h-14 sm:w-12 sm:text-lg"
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
                    className="h-12 w-9 text-base sm:h-14 sm:w-12 sm:text-lg"
                    aria-invalid={!!error}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p id="join-lobby-hint" className="text-sm text-muted-foreground">
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
          <Button
            className="h-11 text-base"
            type="submit"
            disabled={pending || code.length !== 8}
          >
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
