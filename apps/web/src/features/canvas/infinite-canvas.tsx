import {
  CANVAS_HEIGHT,
  CANVAS_REGION_HEIGHT,
  CANVAS_REGION_WIDTH,
  CANVAS_WIDTH,
} from '@app/shared';
import {
  ChatIcon,
  ScreencastIcon,
  SmileyStickerIcon,
} from '@phosphor-icons/react';
import {
  ReactFlow,
  type CoordinateExtent,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type XYPosition,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { EmojiClickData, EmojiStyle } from 'emoji-picker-react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const EMOJI_PICKER_WIDTH = 320;
const EMOJI_PICKER_HEIGHT = 400;
const EMOJI_PICKER_VIEWPORT_PADDING = 12;
const NATIVE_EMOJI_STYLE = 'native' as EmojiStyle;

const EmojiPicker = lazy(() => import('emoji-picker-react'));

const CANVAS_EXTENT: CoordinateExtent = [
  [0, 0],
  [CANVAS_WIDTH, CANVAS_HEIGHT],
];

const FIRST_REGION_BOUNDS = {
  height: CANVAS_REGION_HEIGHT,
  width: CANVAS_REGION_WIDTH,
  x: 0,
  y: 0,
};

type EmojiNode = Node<
  {
    emoji: string;
    label: string;
  },
  'emoji'
>;

const EmojiCanvasNode = ({ data }: NodeProps<EmojiNode>) => (
  <div
    aria-label={data.label}
    className="rounded-lg p-1 text-5xl leading-none select-none"
    role="img"
    title={data.label}
  >
    <span aria-hidden="true">{data.emoji}</span>
  </div>
);

const NODE_TYPES = {
  emoji: EmojiCanvasNode,
};

const CanvasSurface = () => (
  <ViewportPortal>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 overflow-hidden bg-white outline-2 outline-slate-400/70"
      data-canvas-height={CANVAS_HEIGHT}
      data-canvas-width={CANVAS_WIDTH}
      style={{
        backgroundImage:
          'radial-gradient(circle, rgb(148 163 184 / 0.55) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
        height: CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
        zIndex: -1,
      }}
    />
  </ViewportPortal>
);

interface CanvasContextMenuProps {
  onReactionSelect: () => void;
}

const CanvasContextMenu = ({ onReactionSelect }: CanvasContextMenuProps) => {
  return (
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
};

interface EmojiPickerPortalProps {
  anchorPosition: XYPosition;
  onClose: () => void;
  onEmojiSelect: (emoji: string, label: string) => void;
}

const EmojiPickerPortal = ({
  anchorPosition,
  onClose,
  onEmojiSelect,
}: EmojiPickerPortalProps) => {
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
            width={width}
          />
        </Suspense>
      </div>
    </div>,
    document.body,
  );
};

export const InfiniteCanvas = () => {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<EmojiNode>([]);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<XYPosition>();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const handleInit = useCallback((instance: ReactFlowInstance<EmojiNode>) => {
    void instance.fitBounds(FIRST_REGION_BOUNDS, { padding: 0.02 });
  }, []);

  const handleEmojiSelect = useCallback(
    (emoji: string, label: string) => {
      if (!contextMenuPosition) {
        return;
      }

      const position = screenToFlowPosition(contextMenuPosition);

      setNodes((currentNodes) => [
        ...currentNodes,
        {
          ariaLabel: label,
          data: { emoji, label },
          id: crypto.randomUUID(),
          origin: [0.5, 0.5],
          position,
          type: 'emoji',
        },
      ]);
      setEmojiPickerOpen(false);
    },
    [contextMenuPosition, screenToFlowPosition, setNodes],
  );

  const handleReactionSelect = useCallback(() => {
    setContextMenuOpen(false);

    if (contextMenuPosition) {
      setEmojiPickerOpen(true);
    }
  }, [contextMenuPosition]);

  const handleEmojiPickerClose = useCallback(() => {
    setEmojiPickerOpen(false);
  }, []);

  return (
    <>
      <ContextMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger asChild>
          <div
            className="h-full w-full"
            onContextMenu={(event) => {
              setContextMenuPosition({ x: event.clientX, y: event.clientY });
            }}
          >
            <ReactFlow
              aria-label="ManyLatte canvas"
              className="bg-slate-200"
              elementsSelectable
              maxZoom={MAX_ZOOM}
              minZoom={MIN_ZOOM}
              nodeExtent={CANVAS_EXTENT}
              nodeTypes={NODE_TYPES}
              nodes={nodes}
              nodesConnectable={false}
              nodesDraggable
              onInit={handleInit}
              onNodesChange={onNodesChange}
              panActivationKeyCode="Space"
              panOnDrag={[1]}
              panOnScroll
              proOptions={{ hideAttribution: true }}
              translateExtent={CANVAS_EXTENT}
              zoomActivationKeyCode="Control"
              zoomOnDoubleClick={false}
              zoomOnScroll={false}
            >
              <CanvasSurface />
            </ReactFlow>
          </div>
        </ContextMenuTrigger>
        <CanvasContextMenu onReactionSelect={handleReactionSelect} />
      </ContextMenu>

      {emojiPickerOpen && contextMenuPosition && (
        <EmojiPickerPortal
          anchorPosition={contextMenuPosition}
          onClose={handleEmojiPickerClose}
          onEmojiSelect={handleEmojiSelect}
        />
      )}
    </>
  );
};
