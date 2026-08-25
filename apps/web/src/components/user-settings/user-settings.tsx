import {
  CaretDownIcon,
  GearIcon,
  PaintBrushIcon,
  UserIcon,
} from '@phosphor-icons/react';

import { Button } from '../ui/button';
import { useSocket } from '../socket-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { LatteUserIcon } from '../icons/user-icon';

interface UserSettingsProps {
  username: string;
}

export default function UserSettings({ username }: UserSettingsProps) {
  const { user } = useSocket();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open user settings"
          variant="outline"
          className="flex flex-row gap-3 py-0.5 px-2 rounded-full border border-border"
        >
          <LatteUserIcon size={24} backgroundColor={user?.color} />
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
          <DropdownMenuItem>
            <UserIcon />
            Change Username
          </DropdownMenuItem>
          <DropdownMenuItem>
            <PaintBrushIcon />
            Change Color
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <GearIcon />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
