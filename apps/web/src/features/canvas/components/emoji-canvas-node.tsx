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
import type { CursorUser } from '@app/shared';
import { SmileyMeltingIcon, SmileySadIcon } from '@phosphor-icons/react';
import type { Node, NodeProps } from '@xyflow/react';
import { useState } from 'react';

export type EmojiNode = Node<
  {
    emoji: string;
    label: string;
    user?: CursorUser;
  },
  'emoji'
>;

export const EmojiCanvasNode = ({ data }: NodeProps<EmojiNode>) => {
  const [isOpen, setIsOpen] = useState(false);

  const username = data.user?.username ?? 'Unknown user';

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipContent>{username}</TooltipContent>

        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <div
              aria-label={`${username} reacted with ${data.label}`}
              className="relative rounded-full bg-white py-2 shadow select-none"
              role="img"
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setIsOpen((prev) => !prev);
              }}
            >
              <span aria-hidden="true" className="text-5xl leading-none">
                {data.emoji}
              </span>

              <div className="absolute -left-4 h-6 w-6 rounded-full bg-white shadow" />
            </div>
          </DropdownMenuTrigger>
        </TooltipTrigger>
      </Tooltip>

      <DropdownMenuContent>
        <DropdownMenuItem>
          <SmileyMeltingIcon />
          Change reaction
        </DropdownMenuItem>

        <DropdownMenuItem variant="destructive">
          <SmileySadIcon />
          Remove reaction
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
