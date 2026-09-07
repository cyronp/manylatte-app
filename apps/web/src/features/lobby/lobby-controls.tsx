import { createLobbySchema, type Lobby } from '@app/shared';
import { LinkIcon, PlusIcon } from '@phosphor-icons/react';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';

import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Field, FieldLabel } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { createLobby, lobbyInviteUrl } from '../../lib/lobby';

export function LobbyControls({ lobby }: { lobby: Lobby }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'create' | 'share' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const inviteUrl = lobbyInviteUrl(window.location.href, lobby.id);

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
      await navigate({ to: '/', search: { lobby: created.id } });
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

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyStatus('Invite link copied!');
    } catch {
      setCopyStatus(
        'Select the link above and copy it to share with your friends.',
      );
    }
  };

  return (
    <>
      <div className="absolute top-4 left-4 z-50 flex max-w-[calc(100%-10rem)] flex-wrap items-center gap-2">
        <span
          title={lobby.name}
          className="max-w-48 truncate rounded-full border bg-popover px-3 py-1.5 text-sm shadow-sm"
        >
          {lobby.name}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCopyStatus('');
            setDialog('share');
          }}
        >
          <LinkIcon />
          Invite friends
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(undefined);
            setDialog('create');
          }}
        >
          <PlusIcon />
          Create lobby
        </Button>
      </div>
      <Dialog
        open={dialog === 'create'}
        onOpenChange={(open) => {
          if (!pending) setDialog(open ? 'create' : null);
        }}
      >
        <DialogContent>
          <form onSubmit={submit} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Create a lobby</DialogTitle>
              <DialogDescription>
                Start a fresh canvas and invite your friends. Anyone with the
                link can join and edit.
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
      <Dialog
        open={dialog === 'share'}
        onOpenChange={(open) => setDialog(open ? 'share' : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite friends</DialogTitle>
            <DialogDescription>
              Share this link to join {lobby.name}. Anyone with the link can
              view and edit this canvas.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="lobby-invite">Invite link</FieldLabel>
            <Input
              id="lobby-invite"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <Button onClick={copyInvite}>Copy invite link</Button>
          <p role="status" className="text-sm text-muted-foreground">
            {copyStatus}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
