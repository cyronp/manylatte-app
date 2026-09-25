import {
  MessageCircleIcon,
  SmilePlusIcon,
  MonitorIcon,
  StickyNoteIcon,
} from 'lucide-react';
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
  onScreenShareSelect: () => void;
  screenShareDisabled?: boolean;
}

export const CanvasContextMenu = ({
  disabled,
  onCloseAutoFocus,
  onReactionSelect,
  onMessageSelect,
  onPostitSelect,
  onScreenShareSelect,
  screenShareDisabled,
}: CanvasContextMenuProps) => (
  <ContextMenuContent className="w-48" onCloseAutoFocus={onCloseAutoFocus}>
    <ContextMenuItem
      disabled={disabled || screenShareDisabled}
      onSelect={onScreenShareSelect}
    >
      <MonitorIcon />
      Share screen
    </ContextMenuItem>
    <ContextMenuItem disabled={disabled} onSelect={onPostitSelect}>
      <StickyNoteIcon />
      Post-it
    </ContextMenuItem>
    <ContextMenuItem disabled={disabled} onSelect={onReactionSelect}>
      <SmilePlusIcon />
      Reaction
    </ContextMenuItem>
    <ContextMenuItem disabled={disabled} onSelect={onMessageSelect}>
      <MessageCircleIcon />
      Message
    </ContextMenuItem>
  </ContextMenuContent>
);
