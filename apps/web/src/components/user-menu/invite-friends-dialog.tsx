import type { Lobby } from '@app/shared';
import { useEffect } from 'react';
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
import { lobbyInviteUrl } from '../../lib/lobby';
import { CopyStatusIcon } from '../icons/copy-status-icon';
import {
  useCopyToClipboard,
  type CopyStatus,
} from '../../lib/use-copy-to-clipboard';

const SPINNER_REVOLUTION_DURATION_MS = 600;
const STATUS_ENTRANCE_DURATION_MS = 200;
const COPY_FEEDBACK_OPTIONS = {
  minimumLoadingDurationMs: 600,
  successDurationMs: 1800,
  errorDurationMs: 3000,
};

function statusMessage(status: CopyStatus, label: string) {
  switch (status) {
    case 'copying':
      return `Copying ${label}.`;
    case 'copied':
      return `${label} copied.`;
    case 'error':
      return `Could not copy ${label}. Select it above and copy it manually.`;
    default:
      return '';
  }
}

export function InviteFriendsDialog({
  lobby,
  open,
  onOpenChange,
}: {
  lobby: Lobby;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inviteUrl = lobbyInviteUrl(window.location.href, lobby.code);
  const lobbyCodeCopy = useCopyToClipboard(COPY_FEEDBACK_OPTIONS);
  const inviteLinkCopy = useCopyToClipboard(COPY_FEEDBACK_OPTIONS);

  useEffect(() => {
    if (open) return;
    lobbyCodeCopy.reset();
    inviteLinkCopy.reset();
  }, [open, lobbyCodeCopy.reset, inviteLinkCopy.reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite friends</DialogTitle>
          <DialogDescription>
            Share this code or link to join{' '}
            <span className="font-bold">{lobby.name}</span>. Anyone with the
            invite can view and edit this canvas.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="lobby-code">Lobby code</FieldLabel>
          <Input
            id="lobby-code"
            readOnly
            value={lobby.code}
            className="tracking-widest"
            onFocus={(event) => event.target.select()}
          />
        </Field>
        <Button
          variant="outline"
          onClick={() => void lobbyCodeCopy.copy(lobby.code)}
        >
          Copy lobby code
          <CopyStatusIcon
            status={lobbyCodeCopy.status}
            spinnerDurationMs={SPINNER_REVOLUTION_DURATION_MS}
            entranceDurationMs={STATUS_ENTRANCE_DURATION_MS}
          />
        </Button>
        <span className="sr-only" role="status">
          {statusMessage(lobbyCodeCopy.status, 'lobby code')}
        </span>
        <Field>
          <FieldLabel htmlFor="lobby-invite">Invite link</FieldLabel>
          <Input
            id="lobby-invite"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.target.select()}
          />
        </Field>
        <Button onClick={() => void inviteLinkCopy.copy(inviteUrl)}>
          Copy invite link
          <CopyStatusIcon
            status={inviteLinkCopy.status}
            spinnerDurationMs={SPINNER_REVOLUTION_DURATION_MS}
            entranceDurationMs={STATUS_ENTRANCE_DURATION_MS}
          />
        </Button>
        <span className="sr-only" role="status">
          {statusMessage(inviteLinkCopy.status, 'invite link')}
        </span>
      </DialogContent>
    </Dialog>
  );
}
