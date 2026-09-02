import {
  ChatIcon,
  ScreencastIcon,
  SmileyStickerIcon,
} from '@phosphor-icons/react';
import type { ComponentProps } from 'react';

import {
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu';

interface CanvasContextMenuProps {
  onCloseAutoFocus?: ComponentProps<
    typeof ContextMenuContent
  >['onCloseAutoFocus'];
  onReactionSelect: () => void;
  onMessageSelect: () => void;
}

export const CanvasContextMenu = ({
  onCloseAutoFocus,
  onReactionSelect,
  onMessageSelect,
}: CanvasContextMenuProps) => (
  <ContextMenuContent className="w-48" onCloseAutoFocus={onCloseAutoFocus}>
    <ContextMenuItem onSelect={onReactionSelect}>
      <SmileyStickerIcon />
      Reaction
    </ContextMenuItem>
    <ContextMenuItem onSelect={onMessageSelect}>
      <ChatIcon />
      Message
    </ContextMenuItem>
    <ContextMenuItem>
      <ScreencastIcon />
      ScreenShare
    </ContextMenuItem>
  </ContextMenuContent>
);
