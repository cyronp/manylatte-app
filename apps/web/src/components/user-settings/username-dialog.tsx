import { cursorUsernameSchema } from '@app/shared';
import { type SubmitEvent, useState } from 'react';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

interface UsernameDialogProps {
  onOpenChange: (open: boolean) => void;
  onUsernameChange: (username: string) => void;
  open: boolean;
  username: string;
}

const USERNAME_ERROR_ID = 'settings-username-error';

export function UsernameDialog({
  onOpenChange,
  onUsernameChange,
  open,
  username,
}: UsernameDialogProps) {
  const [usernameDraft, setUsernameDraft] = useState(username);
  const [hasUsernameError, setHasUsernameError] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setUsernameDraft(username);
      setHasUsernameError(false);
    }

    onOpenChange(isOpen);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = cursorUsernameSchema.safeParse(usernameDraft);

    if (!result.success) {
      setHasUsernameError(true);
      return;
    }

    setUsernameDraft(result.data);
    setHasUsernameError(false);
    onUsernameChange(result.data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form className="grid gap-6" onSubmit={handleSubmit}>
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
