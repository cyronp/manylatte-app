import { CrownIcon, GavelIcon } from '@phosphor-icons/react';
import { LatteUserIcon } from '../icons/user-icon';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type { CursorUser } from '@app/shared';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

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
              className="flex flex-row justify-between items-center hover:bg-neutral-100 py-1.5 px-2 rounded-lg transition-colors duration-200"
            >
              <div className="flex flex-row items-center gap-2">
                <LatteUserIcon backgroundColor={user.color} />
                <h2>{user.username}</h2>
                {user.userId === userID ? <Badge>You</Badge> : <></>}
              </div>
              {user.userId !== userID ? (
                <div className="flex flex-row gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="destructive">
                        <GavelIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Kick User</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="default">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
