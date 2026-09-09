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
import { cn } from 'cn';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CANVAS_MESSAGE_LENGTH } from '@app/shared';
import { useMessageSubmit } from '../use-message-submit';

const CANCEL_ANIMATION_DURATION_MS = 200;

type MessageDraftData = {
  onCancel: () => void;
  position: { x: number; y: number };
};

export type MessageDraftNode = Node<MessageDraftData, 'messageDraft'>;

export const MessageDraftCanvasNode = ({
  data,
  id,
}: NodeProps<MessageDraftNode>) => {
  const { status, user } = useSocket();
  const zoom = useStore((state) => state.transform[2]);
  const [draft, setDraft] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelCompletedRef = useRef(false);
  const { pending, error, submit } = useMessageSubmit();

  const completeCancel = useCallback(() => {
    if (cancelCompletedRef.current) {
      return;
    }

    cancelCompletedRef.current = true;
    data.onCancel();
  }, [data.onCancel]);

  const cancel = useCallback(() => {
    if (!pending && !isCancelling) {
      setIsCancelling(true);
    }
  }, [isCancelling, pending]);

  useEffect(() => {
    if (!isCancelling) {
      return;
    }

    const timeout = window.setTimeout(
      completeCancel,
      CANCEL_ANIMATION_DURATION_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [completeCancel, isCancelling]);

  const bounceClassName = isCancelling
    ? 'animate-out fade-out zoom-out-50 fill-mode-forwards animation-duration-200 ease-[cubic-bezier(0.36,0,0.66,-0.56)]'
    : 'animate-in fade-in zoom-in-50 animation-duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]';

  return (
    <PopoverPrimitive.Root
      onOpenChange={(isOpen) => {
        if (!isOpen && !draft && !pending) {
          cancel();
        }
      }}
      open
    >
      <div
        className="size-9 origin-top"
        style={{ transform: `scale(${1 / zoom})` }}
      >
        <div
          className={cn('size-9 origin-top-left', bounceClassName)}
          onAnimationEnd={(event) => {
            if (isCancelling && event.currentTarget === event.target) {
              completeCancel();
            }
          }}
        >
          <PopoverPrimitive.Trigger asChild>
            <Button
              aria-label="Cancel new message"
              className="nodrag nowheel size-9 rounded-[18px] rounded-bl-none border-2 border-background bg-background p-0 shadow"
              disabled={isCancelling}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ChatIcon className="size-5" />
            </Button>
          </PopoverPrimitive.Trigger>
        </div>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="center"
          aria-label="New message"
          className={cn(
            'z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none',
            bounceClassName,
          )}
          collisionPadding={12}
          onCloseAutoFocus={(event) => event.preventDefault()}
          side="right"
          sideOffset={12}
          updatePositionStrategy="always"
        >
          <form
            className="nodrag nowheel"
            onSubmit={async (event) => {
              event.preventDefault();

              const text = draft.trim();

              if (!text || !user || status !== 'connected') {
                return;
              }

              await submit(text, (value) => ({
                type: 'thread',
                nodeId: id,
                position: data.position,
                message: { id: crypto.randomUUID(), text: value },
              }));
            }}
          >
            <InputGroup className="rounded-full bg-background">
              <InputGroupInput
                disabled={pending || isCancelling}
                maxLength={MAX_CANVAS_MESSAGE_LENGTH}
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
                  disabled={
                    pending ||
                    isCancelling ||
                    !draft.trim() ||
                    !user ||
                    status !== 'connected'
                  }
                  size="icon-xs"
                  title="Create message"
                  type="submit"
                  variant="default"
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {error && (
              <p role="alert" className="px-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="button"
              variant="destructive"
              disabled={pending || isCancelling}
              onClick={cancel}
            >
              Cancel
            </Button>
          </form>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
