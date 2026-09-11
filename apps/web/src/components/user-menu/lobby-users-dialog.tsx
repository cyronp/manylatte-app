import { CrownIcon, GavelIcon } from '@phosphor-icons/react';
import { LatteUserIcon } from '../icons/user-icon';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type { CursorUser } from '@app/shared';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useState } from 'react';
import { useSocket } from '../socket-provider';
import type { LobbyModeration } from '@app/shared';

interface LobbyUsersDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  users?: CursorUser[];
  userID: string | undefined;
}

export function LobbyUsersDialog({
  onOpenChange,
  open,
  users,
  userID,
}: LobbyUsersDialogProps) {
  const { ownerId, socket, status } = useSocket();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const isOwner = !!userID && ownerId === userID;
  const moderate = async (
    action: LobbyModeration['action'],
    userId: string,
  ) => {
    if (pending || !socket.connected || status !== 'connected') return;
    setPending(true);
    setError(undefined);
    try {
      const result = await socket
        .timeout(5000)
        .emitWithAck('lobby:moderate', { action, userId });
      if (!result.ok) setError(result.message);
    } catch {
      setError(
        'Could not confirm the action. Check the user list before trying again.',
      );
    } finally {
      setPending(false);
    }
  };
  const orderedUsers = [...(users ?? [])].sort((firstUser, secondUser) => {
    if (firstUser.userId === userID) return -1;
    if (secondUser.userId === userID) return 1;
    return 0;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Users in this Lobby</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {orderedUsers.map((user) => (
            <div
              key={user.userId}
              className="flex flex-row items-center justify-between rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-muted"
            >
              <div className="flex flex-row items-center gap-2">
                <LatteUserIcon backgroundColor={user.color} />
                <h2>{user.username}</h2>
                {user.userId === userID && <Badge>You</Badge>}
                {user.userId === ownerId && (
                  <Badge>
                    <CrownIcon />
                    Owner
                  </Badge>
                )}
              </div>
              {isOwner && user.userId !== userID ? (
                <div className="flex flex-row gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={`Kick ${user.username}`}
                        disabled={pending || status !== 'connected'}
                        onClick={() => void moderate('kick', user.userId)}
                      >
                        <GavelIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Kick User</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="default"
                        aria-label={`Make ${user.username} the owner`}
                        disabled={pending || status !== 'connected'}
                        onClick={() => void moderate('transfer', user.userId)}
                      >
                        <CrownIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delegate Owner</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <></>
              )}
            </div>
          ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
