import {
  CANVAS_HEIGHT,
  CANVAS_REGION_HEIGHT,
  CANVAS_REGION_WIDTH,
  CANVAS_WIDTH,
  type CanvasNode as SyncedCanvasNode,
} from '@app/shared';
import {
  ReactFlow,
  SelectionMode,
  type CoordinateExtent,
  type ReactFlowInstance,
  type SnapGrid,
  type XYPosition,
  type NodeChange,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSocket } from '@/components/socket-provider';
import { useUserPreferences } from '@/components/user-preferences-provider';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';

import { CanvasContextMenu } from './components/canvas-context-menu';
import { CanvasControls } from './components/canvas-controls';
import {
  CanvasDock,
  type CanvasAction,
  type CanvasMode,
} from './components/canvas-dock';
import { CanvasSelectionActions } from './components/canvas-selection-actions';
import {
  CanvasPlacementLayer,
  type CanvasPlacement,
} from './components/canvas-placement-layer';
import { CanvasSurface } from './components/canvas-surface';
import { EmojiCanvasNode } from './components/emoji-canvas-node';
import { EmojiPickerPortal } from './components/emoji-picker-portal';
import {
  MessageDraftCanvasNode,
  type MessageDraftNode,
} from './components/message-draft-canvas-node';
import { MessageCanvasNode } from './components/message-canvas-node';
import { PostitCanvasNode } from './components/postit-canvas-node';
import { ScreenShareCanvasNode } from '../screen-share/screen-share-node';
import { useScreenShareNode } from '../screen-share/use-screen-share-node';

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
  screenShare: ScreenShareCanvasNode,
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
  const [mode, setMode] = useState<CanvasMode>('cursor');
  const [placement, setPlacement] = useState<CanvasPlacement>();
  const isCursorMode = mode === 'cursor' && !placement;
  const cancelPlacement = useCallback(() => setPlacement(undefined), []);
  const {
    screen,
    node: screenNode,
    onChanges: onScreenChanges,
  } = useScreenShareNode(status === 'connected' && isCursorMode);
  useEffect(() => {
    if (!screen.starting) return;
    const toastId = toast.loading('Choose a screen, window, or tab to share…', {
      id: 'screen-share-starting',
    });
    return () => {
      toast.dismiss(toastId);
    };
  }, [screen.starting]);
  const screenShareError =
    !screen.share && !screen.starting ? screen.error : undefined;
  useEffect(() => {
    if (!screenShareError) return;
    const toastId = toast.error(screenShareError, { id: 'screen-share-error' });
    return () => {
      toast.dismiss(toastId);
    };
  }, [screenShareError]);
  const handleNodesChange = (changes: NodeChange<FlowCanvasNode>[]) => {
    const persisted = changes.filter(
      (change) => !('id' in change) || change.id !== screenNode?.id,
    );
    if (persisted.length) onNodesChange(persisted);
    onScreenChanges(changes);
  };
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<XYPosition>();
  const [emojiPicker, setEmojiPicker] = useState<{
    anchor: XYPosition;
    placeOnClick: boolean;
  }>();
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
      if (!emojiPicker) return;
      if (emojiPicker.placeOnClick) {
        setPlacement({ action: 'reaction', emoji, label });
        setEmojiPicker(undefined);
        return;
      }

      const position = constrainCursorPosition(
        screenToFlowPosition(emojiPicker.anchor, {
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
      setEmojiPicker(undefined);
    },
    [emojiPicker, screenToFlowPosition, execute, snapToGrid],
  );

  const handleReactionSelect = useCallback(() => {
    setContextMenuOpen(false);

    if (contextMenuPosition) {
      setEmojiPicker({ anchor: contextMenuPosition, placeOnClick: false });
    }
  }, [contextMenuPosition]);

  const createMessageDraft = useCallback(
    (position: XYPosition) => {
      setMode('cursor');
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
    setEmojiPicker(undefined);
  }, []);

  const createPostitDraft = (position: XYPosition) => {
    if (!user) return;
    setMode('cursor');
    const id = crypto.randomUUID();
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id,
        type: 'postit',
        selected: true,
        position,
        origin: [0.5, 0],
        draggable: false,
        data: {
          text: '',
          user,
          draft: {
            position,
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
  };

  const screenShareDisabled =
    !screen.ready || screen.starting || Boolean(screen.share);

  useEffect(() => {
    if (
      status !== 'connected' ||
      (placement?.action === 'screen-share' && screenShareDisabled)
    ) {
      setPlacement(undefined);
    }
  }, [status, placement?.action, screenShareDisabled]);

  const handleDockAction = (action: CanvasAction, anchor: XYPosition) => {
    if (status !== 'connected') return;
    setMode('cursor');
    if (action === 'reaction') {
      setPlacement(undefined);
      setEmojiPicker({ anchor, placeOnClick: true });
    } else {
      setPlacement({ action });
    }
  };

  const handlePlacement = (position: XYPosition) => {
    if (!placement || status !== 'connected') return;
    setPlacement(undefined);
    switch (placement.action) {
      case 'screen-share':
        if (!screenShareDisabled) screen.start(position);
        break;
      case 'postit':
        createPostitDraft(position);
        break;
      case 'reaction':
        void execute({
          type: 'mutation',
          mutation: {
            action: 'create',
            node: {
              id: crypto.randomUUID(),
              type: 'emoji',
              position,
              data: { emoji: placement.emoji, label: placement.label },
            },
          },
        });
        break;
      case 'message':
        createMessageDraft(position);
        break;
    }
  };

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
              cancelPlacement();
              setContextMenuPosition({ x: event.clientX, y: event.clientY });
            }}
          >
            <ReactFlow
              aria-label="ManyLatte canvas"
              className={`bg-canvas-surround${isCursorMode ? '' : ' canvas-navigation-mode'}`}
              deleteKeyCode={isCursorMode ? ['Backspace', 'Delete'] : null}
              disableKeyboardA11y={!isCursorMode}
              elementsSelectable={isCursorMode}
              maxZoom={MAX_ZOOM}
              minZoom={MIN_ZOOM}
              multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
              nodeExtent={CANVAS_EXTENT}
              nodeTypes={NODE_TYPES}
              nodes={screenNode ? [...nodes, screenNode] : nodes}
              nodesConnectable={false}
              nodesDraggable={status === 'connected' && isCursorMode}
              nodesFocusable={isCursorMode}
              onInit={handleInit}
              onNodesChange={handleNodesChange}
              panActivationKeyCode="Space"
              panOnDrag={isCursorMode ? [1] : [0, 1]}
              panOnScroll={mouseWheelBehavior === 'pan'}
              proOptions={{ hideAttribution: true }}
              selectionOnDrag={isCursorMode}
              selectionKeyCode={isCursorMode ? 'Shift' : null}
              selectionMode={SelectionMode.Partial}
              snapGrid={CANVAS_SNAP_GRID}
              snapToGrid={snapToGrid}
              translateExtent={CANVAS_EXTENT}
              zoomActivationKeyCode="Control"
              zoomOnDoubleClick={false}
              zoomOnScroll={mouseWheelBehavior === 'zoom'}
            >
              <CanvasSurface showGrid={showGrid} />
              {placement && status === 'connected' && (
                <CanvasPlacementLayer
                  placement={placement}
                  snapToGrid={snapToGrid}
                  onPlace={handlePlacement}
                  onCancel={cancelPlacement}
                />
              )}
              {isCursorMode && (
                <CanvasSelectionActions disabled={status !== 'connected'} />
              )}
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
              createPostitDraft(postitPosition);
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
          screenShareDisabled={screenShareDisabled}
          onScreenShareSelect={() => {
            if (!contextMenuPosition) return;
            const position = constrainCursorPosition(
              screenToFlowPosition(contextMenuPosition, {
                snapGrid: CANVAS_SNAP_GRID,
                snapToGrid,
              }),
            );
            if (position) screen.start(position);
            setContextMenuOpen(false);
          }}
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

      <CanvasDock
        mode={mode}
        onModeChange={(nextMode) => {
          cancelPlacement();
          setMode(nextMode);
        }}
        activeAction={
          placement?.action ??
          (emojiPicker?.placeOnClick ? 'reaction' : undefined)
        }
        onAction={handleDockAction}
        disabled={status !== 'connected'}
        screenShareDisabled={screenShareDisabled}
      />

      {emojiPicker && (
        <EmojiPickerPortal
          anchorPosition={emojiPicker.anchor}
          onClose={handleEmojiPickerClose}
          onEmojiSelect={handleEmojiSelect}
        />
      )}
    </>
  );
};
