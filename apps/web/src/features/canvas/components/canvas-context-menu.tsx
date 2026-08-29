import {
  ChatIcon,
  ScreencastIcon,
  SmileyStickerIcon,
} from '@phosphor-icons/react';

import {
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu';

interface CanvasContextMenuProps {
  onReactionSelect: () => void;
}

export const CanvasContextMenu = ({
  onReactionSelect,
}: CanvasContextMenuProps) => (
  <ContextMenuContent className="w-48">
    <ContextMenuItem onSelect={onReactionSelect}>
      <SmileyStickerIcon />
      Reaction
    </ContextMenuItem>
    <ContextMenuItem>
      <ChatIcon />
      Message
    </ContextMenuItem>
    <ContextMenuItem>
      <ScreencastIcon />
      ScreenShare
    </ContextMenuItem>
  </ContextMenuContent>
);
