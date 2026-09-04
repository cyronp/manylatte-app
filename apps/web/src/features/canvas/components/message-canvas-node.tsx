import { LatteUserIcon } from '@/components/icons/user-icon';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from '@/components/ui/message';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { useSocket } from '@/components/socket-provider';
import { cn } from '@/lib/utils';
import {
  CircleDashedIcon,
  DotsThreeVerticalIcon,
  MinusIcon,
  PaperPlaneRightIcon,
} from '@phosphor-icons/react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  CANVAS_EVENTS,
  type CanvasMessage,
  type CursorUser,
} from '@app/shared';
import { type Node, type NodeProps, useStore } from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const TYPING_IDLE_TIMEOUT_MS = 1_500;

const getTypingLabel = (users: CursorUser[]) => {
  if (users.length === 1) {
    return `${users[0]?.username} is typing...`;
  }

  if (users.length === 2) {
    return `${users[0]?.username} and ${users[1]?.username} are typing...`;
  }

  return `${users[0]?.username} and ${users.length - 1} others are typing...`;
};

export type MessageNode = Node<
  { messages: CanvasMessage[]; typingUsers: CursorUser[] },
  'message'
>;

export const MessageCanvasNode = ({ data, id }: NodeProps<MessageNode>) => {
  const { socket, status, user, users } = useSocket();
  const zoom = useStore((state) => state.transform[2]);
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(() => data.messages.length === 0);
  const isTypingRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const usersById = useMemo(() => {
    const nextUsers = new Map(
      users.map((canvasUser) => [canvasUser.userId, canvasUser]),
    );

    if (user) {
      nextUsers.set(user.userId, user);
    }

    return nextUsers;
  }, [user, users]);
  const typingUsers = useMemo(
    () =>
      data.typingUsers
        .filter((typingUser) => typingUser.userId !== user?.userId)
        .map((typingUser) => usersById.get(typingUser.userId) ?? typingUser),
    [data.typingUsers, user?.userId, usersById],
  );
  const latestMessage = data.messages.at(-1);
  const latestAuthor = latestMessage
    ? (usersById.get(latestMessage.author.userId) ?? latestMessage.author)
    : undefined;
  const emitTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket.connected) {
        isTypingRef.current = false;
        return;
      }

      if (isTypingRef.current === isTyping) {
        return;
      }

      isTypingRef.current = isTyping;
      socket.emit(CANVAS_EVENTS.typing, { isTyping, nodeId: id });
    },
    [id, socket],
  );
  const stopTyping = useCallback(() => {
    if (typingIdleTimerRef.current !== undefined) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = undefined;
    }

    emitTyping(false);
  }, [emitTyping]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  useLayoutEffect(() => {
    if (!isOpen || !messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [data.messages.length, isOpen]);

  return (
    <PopoverPrimitive.Root
      onOpenChange={(nextIsOpen) => {
        setIsOpen(nextIsOpen);

        if (!nextIsOpen) {
          stopTyping();
        }
      }}
      open={isOpen}
    >
      <div
        className="size-9 origin-top"
        style={{ transform: `scale(${1 / zoom})` }}
      >
        <PopoverPrimitive.Trigger asChild>
          <Button
            aria-label={isOpen ? 'Close messages' : 'Open messages'}
            className={cn(
              'nodrag nowheel group/message h-9 w-9 justify-start overflow-hidden rounded-[18px] rounded-bl-none border-2 border-background bg-background p-0 shadow transition-all duration-200 ease-out',
              !isOpen &&
                'hover:h-16 hover:w-60 hover:bg-background hover:shadow-lg focus-visible:h-16 focus-visible:w-60 hover:p-2 hover: gap-2 dark:hover:bg-background',
            )}
            size="icon"
            type="button"
            variant="ghost"
          >
            {latestAuthor ? (
              <LatteUserIcon backgroundColor={latestAuthor.color} size={32} />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center">
                <CircleDashedIcon className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1 pr-3 text-left opacity-0 transition-opacity duration-100 group-hover/message:opacity-100 group-focus-visible/message:opacity-100">
              <span className="block truncate text-xs font-semibold text-foreground">
                {latestAuthor?.username ?? 'Messages'}
              </span>
              <span className="mt-0.5 line-clamp-2 whitespace-normal text-xs leading-4 text-muted-foreground">
                {latestMessage?.text ?? 'Click to start a conversation.'}
              </span>
            </span>
          </Button>
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          aria-label="Messages"
          className="z-50 flex h-96 w-72 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm outline-none"
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          side="right"
          sideOffset={12}
          updatePositionStrategy="always"
        >
          <div className="flex w-full items-center justify-between gap-2 bg-background border-b border-border p-2 pl-4">
            <span className="text-sm font-medium">Messages</span>
            <div className="flex flex-row gap-2">
              <Button variant="ghost" size="icon-sm" className='nodrag'>
                <DotsThreeVerticalIcon />
              </Button>
              <PopoverPrimitive.Close asChild>
                <Button
                  aria-label="Close messages"
                  className="nodrag"
                  size="icon-sm"
                  title="Close messages"
                  type="button"
                  variant="ghost"
                >
                  <MinusIcon />
                </Button>
              </PopoverPrimitive.Close>
            </div>
          </div>
          <div
            className="nowheel flex flex-1 flex-col gap-6 overflow-y-auto p-4"
            ref={messageListRef}
          >
            {data.messages.map((message) => {
              const author =
                usersById.get(message.author.userId) ?? message.author;
              const isCurrentUser = message.author.userId === user?.userId;

              return (
                <Message
                  align={isCurrentUser ? 'start' : 'end'}
                  key={message.id}
                >
                  <MessageAvatar>
                    <LatteUserIcon
                      backgroundColor={author.color}
                      size={28}
                      title={author.username}
                    />
                  </MessageAvatar>
                  <MessageContent>
                    <MessageHeader>{author.username}</MessageHeader>
                    <Bubble variant={isCurrentUser ? 'default' : 'muted'}>
                      <BubbleContent>{message.text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              );
            })}
          </div>
          {typingUsers.length > 0 && (
            <Marker className="shrink-0 px-4 py-1.5" role="status">
              <MarkerContent className="shimmer">
                {getTypingLabel(typingUsers)}
              </MarkerContent>
            </Marker>
          )}
          <form
            className="nodrag nowheel border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();

              const text = draft.trim();

              if (!text || !user || status !== 'connected') {
                return;
              }

              stopTyping();
              socket.emit(CANVAS_EVENTS.messageSend, {
                id: crypto.randomUUID(),
                nodeId: id,
                text,
              });
              setDraft('');
            }}
          >
            <InputGroup className="rounded-full">
              <InputGroupInput
                aria-label="Message"
                autoComplete="off"
                onBlur={stopTyping}
                onChange={(event) => {
                  const nextDraft = event.target.value;

                  setDraft(nextDraft);

                  if (typingIdleTimerRef.current !== undefined) {
                    clearTimeout(typingIdleTimerRef.current);
                    typingIdleTimerRef.current = undefined;
                  }

                  if (!nextDraft.trim()) {
                    emitTyping(false);
                    return;
                  }

                  emitTyping(true);
                  typingIdleTimerRef.current = setTimeout(() => {
                    typingIdleTimerRef.current = undefined;
                    emitTyping(false);
                  }, TYPING_IDLE_TIMEOUT_MS);
                }}
                placeholder="Type a message..."
                value={draft}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Send message"
                  className="rounded-full"
                  disabled={!draft.trim() || !user || status !== 'connected'}
                  size="icon-sm"
                  title="Send message"
                  type="submit"
                  variant="default"
                >
                  <PaperPlaneRightIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
