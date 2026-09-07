import { createLobbySchema } from '@app/shared';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { createLobby } from '../../lib/lobby';

export function CreateLobbyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const result = createLobbySchema.safeParse({ name });
    if (!result.success) {
      setError('Enter a lobby name with 1–64 visible characters.');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const created = await createLobby(result.data.name);
      await navigate({ to: '/', search: { lobby: created.code } });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not create the lobby. Please try again.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>Create a lobby</DialogTitle>
            <DialogDescription>
              Start a fresh canvas and invite your friends. Anyone with the link
              can join and edit.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="lobby-name">Lobby name</FieldLabel>
            <Input
              id="lobby-name"
              autoFocus
              maxLength={64}
              placeholder="Coffee with friends"
              value={name}
              disabled={pending}
              aria-invalid={!!error}
              aria-describedby={error ? 'lobby-create-error' : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
          {error && (
            <p
              id="lobby-create-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create and join lobby'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
