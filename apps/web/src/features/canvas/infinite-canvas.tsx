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
  type XYPosition,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import { useSocket } from '@/components/socket-provider';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';

import { CanvasContextMenu } from './components/canvas-context-menu';
import { CanvasSurface } from './components/canvas-surface';
import { EmojiCanvasNode } from './components/emoji-canvas-node';
import { EmojiPickerPortal } from './components/emoji-picker-portal';
import {
  MessageDraftCanvasNode,
  type MessageDraftNode,
} from './components/message-draft-canvas-node';
import { MessageCanvasNode } from './components/message-canvas-node';

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
  message: MessageCanvasNode,
  messageDraft: MessageDraftCanvasNode,
};

import { useCanvasSync, type FlowCanvasNode } from './use-canvas-sync';
import { constrainCursorPosition } from '../cursors/cursor-position';
import { Button } from '@/components/ui/button';

export const InfiniteCanvas = () => {
  const { execute, status, error, retryConnect } = useSocket();
  const { screenToFlowPosition } = useReactFlow();
  const { nodes, setNodes, onNodesChange } = useCanvasSync();
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<XYPosition>();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const pendingMessageDraftPositionRef = useRef<XYPosition>(undefined);

  const handleInit = useCallback(
    (instance: ReactFlowInstance<FlowCanvasNode>) => {
      void instance.fitBounds(FIRST_REGION_BOUNDS, { padding: 0.02 });
    },
    [],
  );

  const handleEmojiSelect = useCallback(
    (emoji: string, label: string) => {
      if (!contextMenuPosition) {
        return;
      }

      const position = constrainCursorPosition(
        screenToFlowPosition(contextMenuPosition),
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
    [contextMenuPosition, screenToFlowPosition, execute],
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

    pendingMessageDraftPositionRef.current =
      screenToFlowPosition(contextMenuPosition);
    setContextMenuOpen(false);
  }, [contextMenuPosition, screenToFlowPosition]);

  const handleEmojiPickerClose = useCallback(() => {
    setEmojiPickerOpen(false);
  }, []);

  return (
    <>
      <div
        className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2"
        aria-label="Canvas tools"
      >
        <Button
          disabled={
            status !== 'connected' ||
            nodes.some((node) => node.type === 'messageDraft')
          }
          onClick={() =>
            createMessageDraft(
              screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              }),
            )
          }
        >
          Add message
        </Button>
        <Button
          disabled={status !== 'connected'}
          onClick={() => {
            setContextMenuPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            });
            setEmojiPickerOpen(true);
          }}
        >
          Add reaction
        </Button>
        {status !== 'connected' && (
          <Button variant="outline" onClick={retryConnect}>
            Reconnect
          </Button>
        )}
        <span
          role="status"
          className="basis-full text-sm bg-background rounded px-2"
        >
          {error ??
            (status !== 'connected'
              ? status === 'initializing'
                ? 'Loading canvas…'
                : 'Waiting for connection…'
              : '')}
        </span>
      </div>
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
        <CanvasContextMenu
          onCloseAutoFocus={(event) => {
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
