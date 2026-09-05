import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CANVAS_EVENTS, type CursorUser } from '@app/shared';
import {
  DotsThreeIcon,
  SmileyMeltingIcon,
  SmileySadIcon,
} from '@phosphor-icons/react';
import type { Node, NodeProps } from '@xyflow/react';
import { useRef, useState } from 'react';

import { useSocket } from '@/components/socket-provider';
import { EmojiPickerPortal } from './emoji-picker-portal';

export type EmojiNode = Node<
  {
    emoji: string;
    label: string;
    user?: CursorUser;
  },
  'emoji'
>;

export const EmojiCanvasNode = ({ id, data }: NodeProps<EmojiNode>) => {
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{
    x: number;
    y: number;
  }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingPickerRef = useRef(false);

  const closePicker = () => {
    setPickerPosition(undefined);
  };

  const username = data.user?.username ?? 'Unknown user';

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipContent>{username}</TooltipContent>

          <TooltipTrigger asChild>
            <div
              aria-label={`${username} reacted with ${data.label}`}
              className="relative rounded-full bg-white py-2 shadow select-none"
              role="img"
              onDoubleClick={(event) => {
                event.stopPropagation();
                setIsOpen((prev) => !prev);
              }}
            >
              <span aria-hidden="true" className="text-5xl leading-none">
                {data.emoji}
              </span>
            </div>
          </TooltipTrigger>
        </Tooltip>

        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Reaction actions for ${data.label}`}
            className="nodrag nopan absolute -right-3 -top-2 rounded-full bg-white p-1 text-slate-900 shadow focus-visible:outline-2 focus-visible:outline-ring"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DotsThreeIcon size={20} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="nodrag nopan"
          onCloseAutoFocus={(event) => {
            if (!pendingPickerRef.current) return;
            pendingPickerRef.current = false;
            event.preventDefault();
            const bounds = triggerRef.current?.getBoundingClientRect();
            if (bounds) setPickerPosition({ x: bounds.left, y: bounds.bottom });
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              pendingPickerRef.current = true;
            }}
          >
            <SmileyMeltingIcon />
            Change reaction
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              socket.emit(CANVAS_EVENTS.mutation, {
                action: 'delete',
                nodeId: id,
              });
            }}
          >
            <SmileySadIcon />
            Remove reaction
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {pickerPosition && (
        <EmojiPickerPortal
          anchorPosition={pickerPosition}
          onClose={closePicker}
          onCloseAutoFocus={() => triggerRef.current?.focus()}
          onEmojiSelect={(emoji, label) => {
            socket.emit(CANVAS_EVENTS.mutation, {
              action: 'update-reaction',
              nodeId: id,
              data: { emoji, label },
            });
            closePicker();
          }}
        />
      )}
    </>
  );
};
