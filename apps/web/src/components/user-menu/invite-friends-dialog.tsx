import type { Lobby } from '@app/shared';
import { useEffect, useId } from 'react';
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

function copyButtonLabel(status: CopyStatus, label: string) {
  switch (status) {
    case 'copying':
      return 'Copying…';
    case 'copied':
      return `${label} copied`;
    case 'error':
      return 'Couldn’t copy';
    default:
      return `Copy ${label}`;
  }
}

function CopyField({
  label,
  value,
  open,
  variant,
  inputClassName,
}: {
  label: string;
  value: string;
  open: boolean;
  variant?: 'default' | 'outline';
  inputClassName?: string;
}) {
  const inputId = useId();
  const statusId = `${inputId}-copy-status`;
  const copy = useCopyToClipboard(COPY_FEEDBACK_OPTIONS);
  const normalizedLabel = label.toLocaleLowerCase();

  useEffect(() => {
    if (!open) copy.reset();
  }, [open, copy.reset]);

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="flex flex-col gap-2">
        <Input
          id={inputId}
          readOnly
          value={value}
          className={inputClassName}
          aria-describedby={copy.status === 'error' ? statusId : undefined}
          onFocus={(event) => event.target.select()}
        />
        <Button
          type="button"
          variant={variant}
          className="w-full"
          aria-label={`Copy ${normalizedLabel}`}
          disabled={copy.status === 'copying'}
          onClick={() => void copy.copy(value)}
        >
          {copyButtonLabel(copy.status, normalizedLabel)}
          <CopyStatusIcon
            status={copy.status}
            spinnerDurationMs={SPINNER_REVOLUTION_DURATION_MS}
            entranceDurationMs={STATUS_ENTRANCE_DURATION_MS}
          />
        </Button>
      </div>
      <p
        id={statusId}
        className={
          copy.status === 'error' ? 'text-sm text-destructive' : 'sr-only'
        }
        role="status"
      >
        {statusMessage(copy.status, normalizedLabel)}
      </p>
    </Field>
  );
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
        <CopyField
          label="Lobby code"
          value={lobby.code}
          open={open}
          variant="outline"
          inputClassName="tracking-widest"
        />
        <CopyField label="Invite link" value={inviteUrl} open={open} />
      </DialogContent>
    </Dialog>
  );
}
