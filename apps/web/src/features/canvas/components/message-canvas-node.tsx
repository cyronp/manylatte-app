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
} from '@/components/ui/message';
import { ChatIcon, PaperPlaneRightIcon, XIcon } from '@phosphor-icons/react';
import type { Node } from '@xyflow/react';
import { useState } from 'react';

export type MessageNode = Node<Record<string, never>, 'message'>;

export const MessageCanvasNode = () => {
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [sentMessages, setSentMessages] = useState<
    Array<{ id: string; text: string }>
  >([]);

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
          <ChatIcon />
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
          <XIcon />
        </Button>
      </div>
      <div className="nowheel flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <Message>
          <MessageAvatar>
            <LatteUserIcon size={28} />
          </MessageAvatar>
          <MessageContent>
            <Bubble>
              <BubbleContent>Teste</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
        <Message align="end">
          <MessageAvatar>
            <LatteUserIcon size={28} />
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="muted">
              <BubbleContent>Lorem, ipsum.</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
        {sentMessages.map((message) => (
          <Message align="end" key={message.id}>
            <MessageAvatar>
              <LatteUserIcon size={28} />
            </MessageAvatar>
            <MessageContent>
              <Bubble>
                <BubbleContent>{message.text}</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        ))}
      </div>
      <form
        className="nodrag nowheel border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();

          const text = draft.trim();

          if (!text) {
            return;
          }

          setSentMessages((messages) => [
            ...messages,
            { id: crypto.randomUUID(), text },
          ]);
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
              disabled={!draft.trim()}
              size="icon-sm"
              title="Send message"
              type="submit"
              variant="default"
              className="rounded-full bg-blue-800Te"
            >
              <PaperPlaneRightIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
};
