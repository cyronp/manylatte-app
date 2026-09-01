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
import { useSocket } from '@/components/socket-provider';
import { MinusIcon, PaperPlaneRightIcon, PlusIcon } from '@phosphor-icons/react';
import { CANVAS_EVENTS, type CanvasMessage } from '@app/shared';
import type { Node, NodeProps } from '@xyflow/react';
import { useMemo, useState } from 'react';

export type MessageNode = Node<{ messages: CanvasMessage[] }, 'message'>;

export const MessageCanvasNode = ({ data, id }: NodeProps<MessageNode>) => {
  const { socket, status, user, users } = useSocket();
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const usersById = useMemo(() => {
    const nextUsers = new Map(
      users.map((canvasUser) => [canvasUser.userId, canvasUser]),
    );

    if (user) {
      nextUsers.set(user.userId, user);
    }

    return nextUsers;
  }, [user, users]);

  if (!isOpen) {
    return (
      <div className="flex w-64 items-center justify-between rounded-xl border border-border bg-background p-2 shadow-sm">
        <span className="px-2 text-sm font-medium">Messages</span>
        <Button
          aria-label="Open messages"
          className="nodrag"
          onClick={() => setIsOpen(true)}
          size="icon-sm"
          title="Open messages"
          type="button"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-96 w-72 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex w-full items-center justify-between gap-2 bg-background border-b border-border p-2 pl-4">
        <span className="text-sm font-medium">Messages</span>
        <Button
          aria-label="Close messages"
          className="nodrag"
          onClick={() => setIsOpen(false)}
          size="icon-sm"
          title="Close messages"
          type="button"
          variant="ghost"
        >
          <MinusIcon />
        </Button>
      </div>
      <div className="nowheel flex flex-1 flex-col gap-6 overflow-y-auto p-4">
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
      <form
        className="nodrag nowheel border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();

          const text = draft.trim();

          if (!text || !user || status !== 'connected') {
            return;
          }

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
            onChange={(event) => setDraft(event.target.value)}
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
