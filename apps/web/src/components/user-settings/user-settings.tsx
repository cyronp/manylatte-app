import {
  CaretDownIcon,
  GearIcon,
  PaintBrushIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { cursorUsernameSchema } from '@app/shared';
import { HexColorPicker } from 'react-colorful';
import { type SubmitEvent, useState } from 'react';

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

interface UserSettingsProps {
  onUsernameChange: (username: string) => void;
  username: string;
}

const USERNAME_ERROR_ID = 'settings-username-error';

export default function UserSettings({
  onUsernameChange,
  username,
}: UserSettingsProps) {
  const { setUserColor, user } = useSocket();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(username);
  const [hasUsernameError, setHasUsernameError] = useState(false);

  const handleDialogOpenChange = (isOpen: boolean) => {
    setIsDialogOpen(isOpen);

    if (isOpen) {
      setUsernameDraft(username);
      setHasUsernameError(false);
    }
  };

  const handleUsernameSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = cursorUsernameSchema.safeParse(usernameDraft);

    if (!result.success) {
      setHasUsernameError(true);
      return;
    }

    onUsernameChange(result.data);
    setIsDialogOpen(false);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
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
            <DialogTrigger asChild>
              <DropdownMenuItem>
                <UserIcon />
                Change Username
              </DropdownMenuItem>
            </DialogTrigger>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!user}>
                <PaintBrushIcon />
                Change Color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="p-2">
                <HexColorPicker color={user?.color} onChange={setUserColor} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <GearIcon />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent>
        <form className="grid gap-6" onSubmit={handleUsernameSubmit}>
          <DialogHeader>
            <DialogTitle>Change username</DialogTitle>
          </DialogHeader>
          <Field data-invalid={hasUsernameError}>
            <FieldLabel htmlFor="settings-username">Username</FieldLabel>
            <Input
              aria-describedby={
                hasUsernameError ? USERNAME_ERROR_ID : undefined
              }
              aria-invalid={hasUsernameError}
              autoComplete="nickname"
              autoFocus
              id="settings-username"
              maxLength={32}
              name="username"
              onChange={(event) => {
                setUsernameDraft(event.target.value);
                setHasUsernameError(false);
              }}
              value={usernameDraft}
            />
            <FieldError id={USERNAME_ERROR_ID}>
              {hasUsernameError
                ? 'Enter 1–32 visible characters without control or directional formatting characters.'
                : undefined}
            </FieldError>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
