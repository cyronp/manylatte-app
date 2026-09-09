import {
  CANVAS_EVENTS,
  type CanvasMessage,
  type CanvasHistoryResult,
} from '@app/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/socket-provider';

export function useMessageHistory(
  nodeId: string,
  open: boolean,
  preview: CanvasMessage[],
) {
  const { socket, status } = useSocket();
  const [messages, setMessages] = useState(preview);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const load = useCallback(
    async (before?: string) => {
      if (!socket.connected || status !== 'connected') return;
      const request = ++generation.current;
      const previousIds = new Set(messagesRef.current.map(({ id }) => id));
      setLoading(true);
      try {
        const result: CanvasHistoryResult = await socket
          .timeout(8_000)
          .emitWithAck(CANVAS_EVENTS.history, {
            nodeId,
            ...(before ? { before } : {}),
          });
        if (request !== generation.current) return;
        if (!result.ok) throw new Error(result.message);
        setMessages((current) => {
          const ids = new Set(result.page.messages.map(({ id }) => id));
          return [
            ...result.page.messages,
            ...current.filter(
              ({ id }) => !ids.has(id) && (before || !previousIds.has(id)),
            ),
          ];
        });
        setHasMore(result.page.hasMore);
        setError(undefined);
      } catch {
        if (request === generation.current)
          setError('Could not load messages. Try again.');
      } finally {
        if (request === generation.current) setLoading(false);
      }
    },
    [nodeId, socket, status],
  );
  useEffect(() => {
    if (open) void load();
    return () => {
      generation.current += 1;
    };
  }, [open, load]);
  useEffect(() => {
    setMessages((current) => [
      ...current,
      ...preview.filter(
        (message) => !current.some(({ id }) => id === message.id),
      ),
    ]);
  }, [preview]);
  return {
    messages,
    hasMore,
    loading,
    error,
    loadOlder: () => load(messages[0]?.id),
    retry: () => load(),
  };
}
