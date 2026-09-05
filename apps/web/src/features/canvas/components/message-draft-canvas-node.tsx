import { useSocket } from '@/components/socket-provider';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ArrowUpIcon, ChatIcon } from '@phosphor-icons/react';
import { type Node, type NodeProps, useStore } from '@xyflow/react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useState } from 'react';

type MessageDraftData = {
  onCancel: () => void;
  onSubmit: (text: string) => void;
};

export type MessageDraftNode = Node<MessageDraftData, 'messageDraft'>;

export const MessageDraftCanvasNode = ({
  data,
}: NodeProps<MessageDraftNode>) => {
  const { status, user } = useSocket();
  const zoom = useStore((state) => state.transform[2]);
  const [draft, setDraft] = useState('');

  return (
    <PopoverPrimitive.Root
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          data.onCancel();
        }
      }}
      open
    >
      <div
        className="size-9 origin-top"
        style={{ transform: `scale(${1 / zoom})` }}
      >
        <PopoverPrimitive.Trigger asChild>
          <Button
            aria-label="Cancel new message"
            className="nodrag nowheel size-9 rounded-[18px] rounded-bl-none border-2 border-background bg-background p-0 shadow"
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChatIcon className="size-5" />
          </Button>
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="center"
          aria-label="New message"
          className="z-50 w-72 rounded-full border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none"
          collisionPadding={12}
          onCloseAutoFocus={(event) => event.preventDefault()}
          side="right"
          sideOffset={12}
          updatePositionStrategy="always"
        >
          <form
            className="nodrag nowheel"
            onSubmit={(event) => {
              event.preventDefault();

              const text = draft.trim();

              if (!text || !user || status !== 'connected') {
                return;
              }

              data.onSubmit(text);
            }}
          >
            <InputGroup className="rounded-full bg-background">
              <InputGroupInput
                aria-label="First message"
                autoComplete="off"
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message..."
                value={draft}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Create message"
                  className="rounded-full"
                  disabled={!draft.trim() || !user || status !== 'connected'}
                  size="icon-xs"
                  title="Create message"
                  type="submit"
                  variant="default"
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
