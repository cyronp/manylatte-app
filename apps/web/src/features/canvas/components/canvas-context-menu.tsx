import { ChatIcon, SmileyStickerIcon, NoteIcon } from '@phosphor-icons/react';
import type { ComponentProps } from 'react';

import {
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu';

interface CanvasContextMenuProps {
  disabled?: boolean;
  onCloseAutoFocus?: ComponentProps<
    typeof ContextMenuContent
  >['onCloseAutoFocus'];
  onReactionSelect: () => void;
  onMessageSelect: () => void;
  onPostitSelect: () => void;
}

export const CanvasContextMenu = ({
  disabled,
  onCloseAutoFocus,
  onReactionSelect,
  onMessageSelect,
  onPostitSelect,
}: CanvasContextMenuProps) => (
  <ContextMenuContent className="w-48" onCloseAutoFocus={onCloseAutoFocus}>
    <ContextMenuItem disabled={disabled} onSelect={onPostitSelect}>
      <NoteIcon />
      Post-it
    </ContextMenuItem>
    <ContextMenuItem disabled={disabled} onSelect={onReactionSelect}>
      <SmileyStickerIcon />
      Reaction
    </ContextMenuItem>
    <ContextMenuItem disabled={disabled} onSelect={onMessageSelect}>
      <ChatIcon />
      Message
    </ContextMenuItem>
  </ContextMenuContent>
);
