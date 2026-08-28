import { LatteUserIcon } from '../icons/user-icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type { CursorUser } from '@app/shared';

interface LobbyUsersDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  users?: CursorUser[];
}

export function LobbyUsersDialog({
  onOpenChange,
  open,
  users,
}: LobbyUsersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Users in Lobby</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {users?.map((user, index) => (
            <div key={index} className='flex flex-row gap-2 items-center'>
              <LatteUserIcon backgroundColor={user.color} />
              <h2>{user.username}</h2>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
