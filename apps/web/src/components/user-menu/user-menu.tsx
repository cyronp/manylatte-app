import {
  CaretDownIcon,
  CircleNotchIcon,
  DoorOpenIcon,
  GearIcon,
  LinkIcon,
  PaintBrushIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import { lazy, Suspense, useState, type ComponentProps } from 'react';
import { Link } from '@tanstack/react-router';
import type { CursorUser, Lobby } from '@app/shared';

import { Button } from '../ui/button';
const HexColorPicker = lazy(() =>
  import('../ui/hex-color-picker').then((module) => ({
    default: module.HexColorPicker,
  })),
);
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
const LobbyUsersDialog = lazy(() =>
  import('./lobby-users-dialog').then((module) => ({
    default: module.LobbyUsersDialog,
  })),
);
const SettingsDialog = lazy(() =>
  import('./settings-dialog').then((module) => ({
    default: module.SettingsDialog,
  })),
);
const UsernameDialog = lazy(() =>
  import('./username-dialog').then((module) => ({
    default: module.UsernameDialog,
  })),
);
const CreateLobbyDialog = lazy(() =>
  import('./create-lobby-dialog').then((module) => ({
    default: module.CreateLobbyDialog,
  })),
);
const InviteFriendsDialog = lazy(() =>
  import('./invite-friends-dialog').then((module) => ({
    default: module.InviteFriendsDialog,
  })),
);

interface UserMenuProps {
  lobby: Lobby;
  onUsernameChange: (username: string) => void;
  username: string;
}

const MAX_VISIBLE_USERS = 3;
type ActiveDialog =
  'lobbyusers' | 'settings' | 'username' | 'create' | 'invite' | null;

interface UserMenuTriggerProps extends ComponentProps<typeof Button> {
  loading?: boolean;
  overflowCount: number;
  user?: CursorUser;
  userCount: number;
  visibleUsers: CursorUser[];
}

function UserMenuTrigger({
  loading = false,
  overflowCount,
  user,
  userCount,
  visibleUsers,
  ...buttonProps
}: UserMenuTriggerProps) {
  const hasUserOverflow = overflowCount > 0;

  return (
    <Button
      {...buttonProps}
      aria-busy={loading}
      aria-label={loading ? 'Loading user menu' : 'Open user menu'}
      className="flex flex-row gap-3 rounded-full border-border bg-popover px-2 py-0.5 text-popover-foreground shadow-sm hover:bg-muted dark:border-border dark:bg-popover dark:hover:bg-muted"
      disabled={loading}
      variant="outline"
    >
      <span
        aria-label={`${userCount} users`}
        className="isolate flex -space-x-2"
      >
        {visibleUsers.map((visibleUser, index) => (
          <span
            className="relative size-6 shrink-0"
            key={visibleUser.userId}
            style={{ zIndex: index + 1 }}
          >
            <LatteUserIcon
              backgroundColor={visibleUser.color}
              className={
                visibleUser.userId === user?.userId
                  ? 'rounded-full'
                  : 'rounded-full ring-2 ring-popover'
              }
              size={24}
              title={visibleUser.username}
            />
          </span>
        ))}
        {hasUserOverflow && (
          <span
            aria-label={`${overflowCount} more users`}
            className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground ring-2 ring-popover"
            style={{ zIndex: visibleUsers.length + 1 }}
          >
            +{overflowCount}
          </span>
        )}
      </span>
      {loading ? (
        <CircleNotchIcon aria-hidden="true" className="animate-spin" />
      ) : (
        <CaretDownIcon />
      )}
    </Button>
  );
}

export default function UserMenu({
  lobby,
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
    <Suspense
      fallback={
        <UserMenuTrigger
          loading
          overflowCount={overflowCount}
          user={user}
          userCount={users.length}
          visibleUsers={visibleUsers}
        />
      }
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UserMenuTrigger
            overflowCount={overflowCount}
            user={user}
            userCount={users.length}
            visibleUsers={visibleUsers}
          />
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
            <DropdownMenuItem onSelect={() => setActiveDialog('invite')}>
              <LinkIcon />
              Invite friends
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveDialog('create')}>
              <PlusIcon />
              Create lobby
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
              <DropdownMenuSubContent className="p-4">
                <Suspense fallback={<span role="status">Loading colors…</span>}>
                  <HexColorPicker color={user?.color} onChange={setUserColor} />
                </Suspense>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => setActiveDialog('lobbyusers')}>
              <UsersIcon />
              Lobby Users
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setActiveDialog('settings')}>
              <GearIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem asChild variant="destructive">
              <Link to="/" search={{}}>
                <DoorOpenIcon />
                Leave lobby
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {activeDialog === 'create' && (
        <CreateLobbyDialog
          open
          onOpenChange={(open) => setActiveDialog(open ? 'create' : null)}
        />
      )}
      {activeDialog === 'invite' && (
        <InviteFriendsDialog
          lobby={lobby}
          open
          onOpenChange={(open) => setActiveDialog(open ? 'invite' : null)}
        />
      )}
      {activeDialog === 'username' && (
        <UsernameDialog
          open={activeDialog === 'username'}
          onOpenChange={(isOpen) => setActiveDialog(isOpen ? 'username' : null)}
          onUsernameChange={onUsernameChange}
          username={username}
        />
      )}
      {activeDialog === 'lobbyusers' && (
        <LobbyUsersDialog
          open={activeDialog === 'lobbyusers'}
          onOpenChange={(isOpen) =>
            setActiveDialog(isOpen ? 'lobbyusers' : null)
          }
          users={users}
          userID={user?.userId}
        />
      )}
      {activeDialog === 'settings' && (
        <SettingsDialog
          onOpenChange={(isOpen) => setActiveDialog(isOpen ? 'settings' : null)}
          open={activeDialog === 'settings'}
        />
      )}
    </Suspense>
  );
}
