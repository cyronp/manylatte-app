import type { XYPosition } from '@xyflow/react';
import type {
  EmojiClickData,
  EmojiStyle,
  Theme,
} from 'emoji-picker-react';
import { lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useAppearance } from '@/components/appearance-provider';

const EMOJI_PICKER_WIDTH = 320;
const EMOJI_PICKER_HEIGHT = 400;
const EMOJI_PICKER_VIEWPORT_PADDING = 12;
const NATIVE_EMOJI_STYLE = 'native' as EmojiStyle;
const DARK_EMOJI_THEME = 'dark' as Theme;
const LIGHT_EMOJI_THEME = 'light' as Theme;

const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface EmojiPickerPortalProps {
  anchorPosition: XYPosition;
  onClose: () => void;
  onEmojiSelect: (emoji: string, label: string) => void;
}

export const EmojiPickerPortal = ({
  anchorPosition,
  onClose,
  onEmojiSelect,
}: EmojiPickerPortalProps) => {
  const { isDark } = useAppearance();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  const width = Math.min(
    EMOJI_PICKER_WIDTH,
    Math.max(1, window.innerWidth - EMOJI_PICKER_VIEWPORT_PADDING * 2),
  );
  const height = Math.min(
    EMOJI_PICKER_HEIGHT,
    Math.max(1, window.innerHeight - EMOJI_PICKER_VIEWPORT_PADDING * 2),
  );
  const left = Math.min(
    Math.max(EMOJI_PICKER_VIEWPORT_PADDING, anchorPosition.x),
    Math.max(0, window.innerWidth - width - EMOJI_PICKER_VIEWPORT_PADDING),
  );
  const top = Math.min(
    Math.max(EMOJI_PICKER_VIEWPORT_PADDING, anchorPosition.y),
    Math.max(0, window.innerHeight - height - EMOJI_PICKER_VIEWPORT_PADDING),
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onClose}
    >
      <div
        aria-label="Choose a reaction"
        aria-modal="true"
        className="absolute"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        style={{ height, left, top, width }}
      >
        <Suspense
          fallback={
            <div className="flex size-full items-center justify-center rounded-lg bg-popover text-sm text-muted-foreground shadow-md">
              Loading emoji picker…
            </div>
          }
        >
          <EmojiPicker
            emojiStyle={NATIVE_EMOJI_STYLE}
            height={height}
            lazyLoadEmojis
            onEmojiClick={(emojiData: EmojiClickData) => {
              onEmojiSelect(emojiData.emoji, emojiData.names[0] ?? 'Emoji');
            }}
            previewConfig={{ showPreview: false }}
            searchPlaceholder="Search emojis"
            theme={isDark ? DARK_EMOJI_THEME : LIGHT_EMOJI_THEME}
            width={width}
          />
        </Suspense>
      </div>
    </div>,
    document.body,
  );
};
