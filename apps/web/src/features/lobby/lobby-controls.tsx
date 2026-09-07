import { PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { CreateLobbyDialog } from '../../components/user-menu/create-lobby-dialog';

export function LobbyControls() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        Create lobby
      </Button>
      {open && <CreateLobbyDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
