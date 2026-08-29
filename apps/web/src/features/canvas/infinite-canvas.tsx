import {
  CANVAS_HEIGHT,
  CANVAS_REGION_HEIGHT,
  CANVAS_REGION_WIDTH,
  CANVAS_WIDTH,
} from '@app/shared';
import {
  ReactFlow,
  type CoordinateExtent,
  type ReactFlowInstance,
  type XYPosition,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useState } from 'react';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';

import { CanvasContextMenu } from './components/canvas-context-menu';
import { CanvasSurface } from './components/canvas-surface';
import {
  EmojiCanvasNode,
  type EmojiNode,
} from './components/emoji-canvas-node';
import { EmojiPickerPortal } from './components/emoji-picker-portal';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;

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

const NODE_TYPES = {
  emoji: EmojiCanvasNode,
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
