import {
  CaretDownIcon,
  DoorOpenIcon,
  GearIcon,
  PaintBrushIcon,
  UserIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import { HexColorPicker } from 'react-colorful';
import { useState } from 'react';

import { Button } from '../ui/button';
import { useSocket } from '../socket-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

import { LatteUserIcon } from '../icons/user-icon';
import { LobbyUsersDialog } from './lobby-users-dialog';
import { UsernameDialog } from './username-dialog';

interface UserMenuProps {
  onUsernameChange: (username: string) => void;
  username: string;
}

const MAX_VISIBLE_USERS = 3;
type ActiveDialog = 'lobbyusers' | 'username' | null;

export default function UserMenu({
  onUsernameChange,
  username,
}: UserMenuProps) {
  const { setUserColor, user, users } = useSocket();
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const hasUserOverflow = users.length > MAX_VISIBLE_USERS;
  const visibleUserLimit = hasUserOverflow
    ? MAX_VISIBLE_USERS - 1
    : MAX_VISIBLE_USERS;
  const currentUser = users.find(
    (visibleUser) => visibleUser.userId === user?.userId,
  );
  const otherUsers = users.filter(
    (visibleUser) => visibleUser.userId !== user?.userId,
  );
  const visibleUsers = currentUser
    ? [currentUser, ...otherUsers.slice(0, visibleUserLimit - 1)]
    : users.slice(0, visibleUserLimit);
  const overflowCount = users.length - visibleUsers.length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Open user menu"
            variant="outline"
            className="flex flex-row gap-3 py-0.5 px-2 rounded-full border border-border"
          >
            <span
              className="isolate flex -space-x-2"
              aria-label={`${users.length} users`}
            >
              {visibleUsers.map((visibleUser, index) => (
                <span
                  key={visibleUser.userId}
                  className="relative size-6 shrink-0"
                  style={{ zIndex: index + 1 }}
                >
                  <LatteUserIcon
                    size={24}
                    backgroundColor={visibleUser.color}
                    className={
                      visibleUser.userId === user?.userId
                        ? 'rounded-full'
                        : 'rounded-full ring-2 ring-background'
                    }
                    title={visibleUser.username}
                  />
                </span>
              ))}
              {hasUserOverflow ? (
                <span
                  aria-label={`${overflowCount} more users`}
                  className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-muted-foreground ring-2 ring-background"
                  style={{
                    zIndex: visibleUsers.length + 1,
                  }}
                >
                  +{overflowCount}
                </span>
              ) : null}
            </span>
            <CaretDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem className="pointer-events-none">
              <div className="flex flex-row gap-2 items-center">
                <LatteUserIcon size={32} backgroundColor={user?.color} />
                <p>{username}</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setActiveDialog('username')}>
              <UserIcon />
              Change Username
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!user}>
                <PaintBrushIcon />
                Change Color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="p-2">
                <HexColorPicker color={user?.color} onChange={setUserColor} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => setActiveDialog('lobbyusers')}>
              <UsersIcon />
              Lobby Users
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <GearIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem variant='destructive'>
              <DoorOpenIcon/>
              Leave
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <UsernameDialog
        open={activeDialog === 'username'}
        onOpenChange={(isOpen) => setActiveDialog(isOpen ? 'username' : null)}
        onUsernameChange={onUsernameChange}
        username={username}
      />
      <LobbyUsersDialog
        open={activeDialog === 'lobbyusers'}
        onOpenChange={(isOpen) => setActiveDialog(isOpen ? 'lobbyusers' : null)}
        users={users}
        userID={user?.userId}
      />
    </>
  );
}
