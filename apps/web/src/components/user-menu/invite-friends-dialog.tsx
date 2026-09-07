import type { Lobby } from '@app/shared';
import { useState } from 'react';
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

export function InviteFriendsDialog({
  lobby,
  open,
  onOpenChange,
}: {
  lobby: Lobby;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const inviteUrl = lobbyInviteUrl(window.location.href, lobby.code);
  const copyInvite = async (codeOnly = false) => {
    try {
      await navigator.clipboard.writeText(codeOnly ? lobby.code : inviteUrl);
      setCopyStatus(codeOnly ? 'Lobby code copied!' : 'Invite link copied!');
    } catch {
      setCopyStatus(
        'Select the code or link above and copy it to share with your friends.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite friends</DialogTitle>
          <DialogDescription>
            Share this code or link to join {lobby.name}. Anyone with the invite
            can view and edit this canvas.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="lobby-code">Lobby code</FieldLabel>
          <Input
            id="lobby-code"
            readOnly
            value={lobby.code}
            className="font-mono tracking-widest"
            onFocus={(event) => event.target.select()}
          />
        </Field>
        <Button variant="outline" onClick={() => copyInvite(true)}>
          Copy lobby code
        </Button>
        <Field>
          <FieldLabel htmlFor="lobby-invite">Invite link</FieldLabel>
          <Input
            id="lobby-invite"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.target.select()}
          />
        </Field>
        <Button onClick={() => copyInvite()}>Copy invite link</Button>
        <p role="status" className="text-sm text-muted-foreground">
          {copyStatus}
        </p>
      </DialogContent>
    </Dialog>
  );
}
