import {
  CANVAS_EVENTS,
  CANVAS_HEIGHT,
  CANVAS_REGION_HEIGHT,
  CANVAS_REGION_WIDTH,
  CANVAS_WIDTH,
  type CanvasNode as SyncedCanvasNode,
  type CanvasNodeMutation,
} from '@app/shared';
import {
  ReactFlow,
  type CoordinateExtent,
  type ReactFlowInstance,
  type XYPosition,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSocket } from '@/components/socket-provider';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';

import { CanvasContextMenu } from './components/canvas-context-menu';
import { CanvasSurface } from './components/canvas-surface';
import {
  EmojiCanvasNode,
  type EmojiNode,
} from './components/emoji-canvas-node';
import { EmojiPickerPortal } from './components/emoji-picker-portal';
import {
  MessageDraftCanvasNode,
  type MessageDraftNode,
} from './components/message-draft-canvas-node';
import {
  MessageCanvasNode,
  type MessageNode,
} from './components/message-canvas-node';

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

type SyncedFlowCanvasNode = EmojiNode | MessageNode;
type FlowCanvasNode = SyncedFlowCanvasNode | MessageDraftNode;

const toFlowCanvasNode = (node: SyncedCanvasNode): SyncedFlowCanvasNode => {
  if (node.type === 'emoji') {
    return {
      ...node,
      ariaLabel: node.data.label,
      origin: [0.5, 0.5],
    };
  }

  return {
    ...node,
    data: { ...node.data, typingUsers: [] },
    origin: [0.5, 0],
  };
};

const toCanvasMoveMutation = (
  node: SyncedFlowCanvasNode,
): CanvasNodeMutation => ({
  action: 'move',
  nodeId: node.id,
  position: node.position,
});

export const InfiniteCanvas = () => {
  const { socket } = useSocket();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowCanvasNode>([]);
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

  useEffect(() => {
    const handleSnapshot: Parameters<
      typeof socket.on<'canvas:snapshot'>
    >[1] = ({ nodes: syncedNodes }) => {
      setNodes((currentNodes) => [
        ...syncedNodes.map(toFlowCanvasNode),
        ...currentNodes.filter((node) => node.type === 'messageDraft'),
      ]);
    };
    const handleNodeUpsert: Parameters<
      typeof socket.on<'canvas:node-upsert'>
    >[1] = (syncedNode) => {
      const nextNode = toFlowCanvasNode(syncedNode);

      setNodes((currentNodes) => {
        const hasNode = currentNodes.some(({ id }) => id === nextNode.id);

        if (!hasNode) {
          return [...currentNodes, nextNode];
        }

        return currentNodes.map((currentNode) =>
          currentNode.id === nextNode.id
            ? currentNode.type === 'message' && nextNode.type === 'message'
              ? {
                  ...currentNode,
                  ...nextNode,
                  data: {
                    ...nextNode.data,
                    typingUsers: currentNode.data.typingUsers,
                  },
                }
              : { ...currentNode, ...nextNode }
            : currentNode,
        );
      });
    };
    const handleTyping: Parameters<typeof socket.on<'canvas:typing'>>[1] = ({
      isTyping,
      nodeId,
      user: typingUser,
    }) => {
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
          if (currentNode.id !== nodeId || currentNode.type !== 'message') {
            return currentNode;
          }

          const typingUsers = isTyping
            ? [
                ...currentNode.data.typingUsers.filter(
                  ({ userId }) => userId !== typingUser.userId,
                ),
                typingUser,
              ]
            : currentNode.data.typingUsers.filter(
                ({ userId }) => userId !== typingUser.userId,
              );

          return {
            ...currentNode,
            data: { ...currentNode.data, typingUsers },
          };
        }),
      );
    };

    socket.on(CANVAS_EVENTS.snapshot, handleSnapshot);
    socket.on(CANVAS_EVENTS.nodeUpsert, handleNodeUpsert);
    socket.on(CANVAS_EVENTS.typing, handleTyping);

    return () => {
      socket.off(CANVAS_EVENTS.snapshot, handleSnapshot);
      socket.off(CANVAS_EVENTS.nodeUpsert, handleNodeUpsert);
      socket.off(CANVAS_EVENTS.typing, handleTyping);
    };
  }, [setNodes, socket]);

  const handleEmojiSelect = useCallback(
    (emoji: string, label: string) => {
      if (!contextMenuPosition) {
        return;
      }

      const position = screenToFlowPosition(contextMenuPosition);

      const node: SyncedCanvasNode = {
        data: { emoji, label },
        id: crypto.randomUUID(),
        position,
        type: 'emoji',
      };

      setNodes((currentNodes) => [...currentNodes, toFlowCanvasNode(node)]);
      socket.emit(CANVAS_EVENTS.mutation, {
        action: 'create',
        node,
      });
      setEmojiPickerOpen(false);
    },
    [contextMenuPosition, screenToFlowPosition, setNodes, socket],
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
          onCancel: () => {
            setNodes((currentNodes) =>
              currentNodes.filter((currentNode) => currentNode.id !== nodeId),
            );
          },
          onSubmit: (text) => {
            const messageNode: SyncedCanvasNode = {
              data: { messages: [] },
              id: nodeId,
              position,
              type: 'message',
            };

            setNodes((currentNodes) =>
              currentNodes.map((currentNode) =>
                currentNode.id === nodeId
                  ? toFlowCanvasNode(messageNode)
                  : currentNode,
              ),
            );
            socket.emit(CANVAS_EVENTS.mutation, {
              action: 'create',
              node: {
                id: messageNode.id,
                position: messageNode.position,
                type: messageNode.type,
              },
            });
            socket.emit(CANVAS_EVENTS.messageSend, {
              id: crypto.randomUUID(),
              nodeId,
              text,
            });
          },
        },
        draggable: false,
        id: nodeId,
        origin: [0.5, 0],
        position,
        type: 'messageDraft',
      };

      setNodes((currentNodes) => [
        ...currentNodes.filter(
          (currentNode) => currentNode.type !== 'messageDraft',
        ),
        node,
      ]);
    },
    [setNodes, socket],
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
              elementsSelectable
              maxZoom={MAX_ZOOM}
              minZoom={MIN_ZOOM}
              nodeExtent={CANVAS_EXTENT}
              nodeTypes={NODE_TYPES}
              nodes={nodes}
              nodesConnectable={false}
              nodesDraggable
              onInit={handleInit}
              onNodeDragStop={(event, node) => {
                void event;

                if (node.type === 'messageDraft') {
                  return;
                }

                socket.emit(CANVAS_EVENTS.mutation, toCanvasMoveMutation(node));
              }}
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
