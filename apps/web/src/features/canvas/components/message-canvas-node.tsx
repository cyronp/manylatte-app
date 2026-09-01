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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSocket } from '@/components/socket-provider';
import {
  ChatIcon,
  MinusIcon,
  PaperPlaneRightIcon,
} from '@phosphor-icons/react';
import {
  CANVAS_EVENTS,
  type CanvasMessage,
  type CursorUser,
} from '@app/shared';
import type { Node, NodeProps } from '@xyflow/react';
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

  if (!isOpen) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="nodrag bg-background shadow nowheel overflow-hidden rounded-full rounded-bl-none border-2 border-background p-0 transition-transform hover:scale-105"
            onClick={() => setIsOpen(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {latestAuthor ? (
              <LatteUserIcon
                backgroundColor={latestAuthor.color}
                className="size-full"
                title={latestAuthor.username}
              />
            ) : (
              <ChatIcon className="size-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="w-64 max-w-64 items-start gap-3 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl [&>svg]:bg-popover [&>svg]:fill-popover"
          collisionPadding={12}
          side="right"
          sideOffset={10}
        >
          {latestMessage && latestAuthor ? (
            <>
              <LatteUserIcon
                backgroundColor={latestAuthor.color}
                size={36}
                title={latestAuthor.username}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {latestAuthor.username}
                </p>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {latestMessage.text}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <ChatIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Messages</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Click to start a conversation.
                </p>
              </div>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex h-96 w-72 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex w-full items-center justify-between gap-2 bg-background border-b border-border p-2 pl-4">
        <span className="text-sm font-medium">Messages</span>
        <Button
          aria-label="Close messages"
          className="nodrag"
          onClick={() => {
            stopTyping();
            setIsOpen(false);
          }}
          size="icon-sm"
          title="Close messages"
          type="button"
          variant="ghost"
        >
          <MinusIcon />
        </Button>
      </div>
      <div
        className="nowheel flex flex-1 flex-col gap-6 overflow-y-auto p-4"
        ref={messageListRef}
      >
        {data.messages.map((message) => {
          const author = usersById.get(message.author.userId) ?? message.author;
          const isCurrentUser = message.author.userId === user?.userId;

          return (
            <Message align={isCurrentUser ? 'start' : 'end'} key={message.id}>
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
    </div>
  );
};
