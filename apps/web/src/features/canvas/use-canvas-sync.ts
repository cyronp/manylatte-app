import { CANVAS_EVENTS, type CanvasNode, type CanvasChange } from '@app/shared';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/socket-provider';
import type { EmojiNode } from './components/emoji-canvas-node';
import type { MessageNode } from './components/message-canvas-node';
import type { MessageDraftNode } from './components/message-draft-canvas-node';

export type FlowCanvasNode = EmojiNode | MessageNode | MessageDraftNode;
export const toFlowCanvasNode = (node: CanvasNode): EmojiNode | MessageNode =>
  node.type === 'emoji'
    ? { ...node, ariaLabel: node.data.label, origin: [0.5, 0.5] }
    : { ...node, data: { ...node.data, typingUsers: [] }, origin: [0.5, 0] };

export function applyCanvasChange(
  nodes: FlowCanvasNode[],
  change: CanvasChange,
): FlowCanvasNode[] {
  if (change.type === 'remove')
    return nodes.filter(({ id }) => id !== change.nodeId);
  if (change.type === 'upsert') {
    const next = toFlowCanvasNode(change.node);
    return nodes.some(({ id }) => id === next.id)
      ? nodes.map((node) =>
          node.id === next.id
            ? { ...next, selected: node.selected, measured: node.measured }
            : node,
        )
      : [...nodes, next];
  }
  return nodes.map((node) => {
    if (node.id !== change.nodeId) return node;
    if (change.type === 'move') return { ...node, position: change.position };
    if (node.type !== 'message') return node;
    return {
      ...node,
      data: {
        ...node.data,
        messages: [change.message],
        messageCount: change.messageCount,
      },
    };
  });
}

export function useCanvasSync() {
  const { socket, execute, status } = useSocket();
  const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
  const canonical = useRef<FlowCanvasNode[]>([]);
  const moves = useRef(new Map<string, { x: number; y: number }>());
  const running = useRef(false);
  useEffect(() => {
    const pendingMoves = moves.current;
    const snapshot: Parameters<typeof socket.on<'canvas:snapshot'>>[1] = ({
      nodes: incoming,
    }) => {
      canonical.current = incoming.map(toFlowCanvasNode);
      setNodes((current) => [
        ...canonical.current,
        ...current.filter(
          (node) =>
            node.type === 'messageDraft' &&
            !incoming.some(({ id }) => id === node.id),
        ),
      ]);
    };
    const change = (update: CanvasChange) => {
      canonical.current = applyCanvasChange(canonical.current, update);
      setNodes((current) => applyCanvasChange(current, update));
    };
    const typing: Parameters<typeof socket.on<'canvas:typing'>>[1] = ({
      nodeId,
      user,
      isTyping,
    }) =>
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId && node.type === 'message'
            ? {
                ...node,
                data: {
                  ...node.data,
                  typingUsers: [
                    ...node.data.typingUsers.filter(
                      ({ userId }) => userId !== user.userId,
                    ),
                    ...(isTyping ? [user] : []),
                  ],
                },
              }
            : node,
        ),
      );
    const disconnect = () => {
      pendingMoves.clear();
      setNodes((current) =>
        current.map((node) =>
          node.type === 'message'
            ? { ...node, data: { ...node.data, typingUsers: [] } }
            : node,
        ),
      );
    };
    socket.on(CANVAS_EVENTS.snapshot, snapshot);
    socket.on(CANVAS_EVENTS.change, change);
    socket.on(CANVAS_EVENTS.typing, typing);
    socket.on('disconnect', disconnect);
    return () => {
      pendingMoves.clear();
      socket.off(CANVAS_EVENTS.snapshot, snapshot);
      socket.off(CANVAS_EVENTS.change, change);
      socket.off(CANVAS_EVENTS.typing, typing);
      socket.off('disconnect', disconnect);
    };
  }, [socket]);
  const flushMoves = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (moves.current.size) {
        const [nodeId, position] = moves.current.entries().next().value!;
        moves.current.delete(nodeId);
        const result = await execute({
          type: 'mutation',
          mutation: { action: 'move', nodeId, position },
        });
        if (!result.ok) {
          const saved = canonical.current.find(({ id }) => id === nodeId);
          if (saved)
            setNodes((current) =>
              current.map((node) =>
                node.id === nodeId
                  ? { ...node, position: saved.position }
                  : node,
              ),
            );
        }
      }
    } finally {
      running.current = false;
    }
  }, [execute]);
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowCanvasNode>[]) => {
      const local = changes.filter((change) => {
        if (change.type === 'remove') {
          const node = canonical.current.find(({ id }) => id === change.id);
          if (!node) return true;
          if (status === 'connected')
            void execute({
              type: 'mutation',
              mutation: { action: 'delete', nodeId: change.id },
            });
          return false;
        }
        if (change.type === 'position') {
          if (status !== 'connected') return false;
          if (change.position && change.dragging === false)
            moves.current.set(change.id, change.position);
        }
        return true;
      });
      setNodes((current) => applyNodeChanges(local, current));
      void flushMoves();
    },
    [execute, flushMoves, status],
  );
  return { nodes, setNodes, onNodesChange };
}
