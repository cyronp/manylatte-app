import {
  CANVAS_HEIGHT,
  CANVAS_REGION_HEIGHT,
  CANVAS_REGION_WIDTH,
  CANVAS_WIDTH,
  type CanvasNode as SyncedCanvasNode,
} from '@app/shared';
import {
  ReactFlow,
  type CoordinateExtent,
  type ReactFlowInstance,
  type SnapGrid,
  type XYPosition,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import { useSocket } from '@/components/socket-provider';
import { useUserPreferences } from '@/components/user-preferences-provider';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';

import { CanvasContextMenu } from './components/canvas-context-menu';
import { CanvasControls } from './components/canvas-controls';
import { CanvasSurface } from './components/canvas-surface';
import { EmojiCanvasNode } from './components/emoji-canvas-node';
import { EmojiPickerPortal } from './components/emoji-picker-portal';
import {
  MessageDraftCanvasNode,
  type MessageDraftNode,
} from './components/message-draft-canvas-node';
import { MessageCanvasNode } from './components/message-canvas-node';
import { PostitCanvasNode } from './components/postit-canvas-node';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const CANVAS_SNAP_GRID: SnapGrid = [32, 32];

const CANVAS_EXTENT: CoordinateExtent = [
  [0, 0],
  [CANVAS_WIDTH, CANVAS_HEIGHT],
];

const INITIAL_VIEW_BOUNDS = {
  height: CANVAS_REGION_HEIGHT,
  width: CANVAS_REGION_WIDTH,
  x: (CANVAS_WIDTH - CANVAS_REGION_WIDTH) / 2,
  y: (CANVAS_HEIGHT - CANVAS_REGION_HEIGHT) / 2,
};

const NODE_TYPES = {
  postit: PostitCanvasNode,
  emoji: EmojiCanvasNode,
  message: MessageCanvasNode,
  messageDraft: MessageDraftCanvasNode,
};

import { useCanvasSync, type FlowCanvasNode } from './use-canvas-sync';
import { useInsertionShortcuts } from './use-insertion-shortcuts';
import { constrainCursorPosition } from '../cursors/cursor-position';
import { Button } from '@/components/ui/button';

export const InfiniteCanvas = () => {
  useInsertionShortcuts();
  const { execute, status, error, retryConnect, user } = useSocket();
  const { mouseWheelBehavior, showGrid, snapToGrid } = useUserPreferences();
  const { screenToFlowPosition } = useReactFlow();
  const { nodes, setNodes, onNodesChange } = useCanvasSync();
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<XYPosition>();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const pendingMessageDraftPositionRef = useRef<XYPosition>(undefined);
  const pendingPostitPositionRef = useRef<XYPosition>(undefined);

  const handleInit = useCallback(
    (instance: ReactFlowInstance<FlowCanvasNode>) => {
      void instance.fitBounds(INITIAL_VIEW_BOUNDS, { padding: 0.02 });
    },
    [],
  );

  const handleEmojiSelect = useCallback(
    (emoji: string, label: string) => {
      if (!contextMenuPosition) {
        return;
      }

      const position = constrainCursorPosition(
        screenToFlowPosition(contextMenuPosition, {
          snapGrid: CANVAS_SNAP_GRID,
          snapToGrid,
        }),
      );
      if (!position) return;

      const node: SyncedCanvasNode = {
        data: { emoji, label },
        id: crypto.randomUUID(),
        position: constrainCursorPosition(position) ?? { x: 0, y: 0 },
        type: 'emoji',
      };

      void execute({
        type: 'mutation',
        mutation: {
          action: 'create',
          node: { ...node, data: { emoji, label } },
        },
      });
      setEmojiPickerOpen(false);
    },
    [contextMenuPosition, screenToFlowPosition, execute, snapToGrid],
  );

  const handleReactionSelect = useCallback(() => {
    setContextMenuOpen(false);

    if (contextMenuPosition) {
      setEmojiPickerOpen(true);
    }
  }, [contextMenuPosition]);

  const createMessageDraft = useCallback(
    (position: XYPosition) => {
      const nodeId = crypto.randomUUID();
      const node: MessageDraftNode = {
        data: {
          position: constrainCursorPosition(position) ?? { x: 0, y: 0 },
          onCancel: () => {
            setNodes((currentNodes) =>
              currentNodes.filter((currentNode) => currentNode.id !== nodeId),
            );
          },
        },
        draggable: false,
        id: nodeId,
        origin: [0.5, 0],
        position: constrainCursorPosition(position) ?? { x: 0, y: 0 },
        type: 'messageDraft',
      };

      setNodes((currentNodes) => [
        ...currentNodes.filter(
          (currentNode) => currentNode.type !== 'messageDraft',
        ),
        node,
      ]);
    },
    [setNodes],
  );

  const handleMessageSelect = useCallback(() => {
    if (!contextMenuPosition) {
      return;
    }

    pendingMessageDraftPositionRef.current = screenToFlowPosition(
      contextMenuPosition,
      {
        snapGrid: CANVAS_SNAP_GRID,
        snapToGrid,
      },
    );
    setContextMenuOpen(false);
  }, [contextMenuPosition, screenToFlowPosition, snapToGrid]);

  const handleEmojiPickerClose = useCallback(() => {
    setEmojiPickerOpen(false);
  }, []);

  return (
    <>
      {status !== 'connected' && (
        <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
          <Button variant="outline" onClick={retryConnect}>
            Reconnect
          </Button>
          <span
            role="status"
            className="basis-full rounded bg-background px-2 text-sm"
          >
            {error ??
              (status === 'initializing'
                ? 'Loading canvas…'
                : 'Waiting for connection…')}
          </span>
        </div>
      )}
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
              className="bg-canvas-surround"
              deleteKeyCode={['Backspace', 'Delete']}
              elementsSelectable
              maxZoom={MAX_ZOOM}
              minZoom={MIN_ZOOM}
              nodeExtent={CANVAS_EXTENT}
              nodeTypes={NODE_TYPES}
              nodes={nodes}
              nodesConnectable={false}
              nodesDraggable={status === 'connected'}
              onInit={handleInit}
              onNodesChange={onNodesChange}
              panActivationKeyCode="Space"
              panOnDrag={[1]}
              panOnScroll={mouseWheelBehavior === 'pan'}
              proOptions={{ hideAttribution: true }}
              snapGrid={CANVAS_SNAP_GRID}
              snapToGrid={snapToGrid}
              translateExtent={CANVAS_EXTENT}
              zoomActivationKeyCode="Control"
              zoomOnDoubleClick={false}
              zoomOnScroll={mouseWheelBehavior === 'zoom'}
            >
              <CanvasSurface showGrid={showGrid} />
            </ReactFlow>
            <CanvasControls />
          </div>
        </ContextMenuTrigger>
        <CanvasContextMenu
          onCloseAutoFocus={(event) => {
            const postitPosition = pendingPostitPositionRef.current;
            if (postitPosition && user) {
              pendingPostitPositionRef.current = undefined;
              event.preventDefault();
              const id = crypto.randomUUID();
              setNodes((current) => [
                ...current,
                {
                  id,
                  type: 'postit',
                  position: postitPosition,
                  origin: [0.5, 0],
                  draggable: false,
                  data: {
                    text: '',
                    user,
                    draft: {
                      position: postitPosition,
                      onCancel: () =>
                        setNodes((nodes) =>
                          nodes.filter(
                            (node) =>
                              node.id !== id ||
                              node.type !== 'postit' ||
                              !node.data.draft,
                          ),
                        ),
                    },
                  },
                },
              ]);
              return;
            }
            const draftPosition = pendingMessageDraftPositionRef.current;

            if (!draftPosition) {
              return;
            }

            pendingMessageDraftPositionRef.current = undefined;
            event.preventDefault();
            createMessageDraft(draftPosition);
          }}
          disabled={status !== 'connected'}
          onMessageSelect={handleMessageSelect}
          onPostitSelect={() => {
            if (!contextMenuPosition) return;
            const position = constrainCursorPosition(
              screenToFlowPosition(contextMenuPosition, {
                snapGrid: CANVAS_SNAP_GRID,
                snapToGrid,
              }),
            );
            if (!position) return;
            pendingPostitPositionRef.current = position;
            setContextMenuOpen(false);
          }}
          onReactionSelect={handleReactionSelect}
        />
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
