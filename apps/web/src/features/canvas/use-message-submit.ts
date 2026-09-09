import { canvasMessageTextSchema, type CanvasCommandBody } from '@app/shared';
import { useRef, useState } from 'react';
import { useSocket } from '@/components/socket-provider';

export function useMessageSubmit() {
  const { execute } = useSocket();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const retry = useRef<
    { key: string; id: string; body: CanvasCommandBody } | undefined
  >(undefined);
  const busy = useRef(false);
  const submit = async (
    text: string,
    createBody: (text: string) => CanvasCommandBody,
  ) => {
    if (busy.current) return false;
    const parsed = canvasMessageTextSchema.safeParse(text);
    if (!parsed.success) {
      setError(
        'Enter a message of up to 1,000 characters without control characters.',
      );
      return false;
    }
    // Keep the entire request, including message IDs, identical after an uncertain acknowledgement.
    if (retry.current?.key !== parsed.data)
      retry.current = {
        key: parsed.data,
        id: crypto.randomUUID(),
        body: createBody(parsed.data),
      };
    busy.current = true;
    setPending(true);
    const result = await execute(retry.current.body, retry.current.id);
    busy.current = false;
    setPending(false);
    setError(result.ok ? undefined : result.message);
    if (result.ok) retry.current = undefined;
    return result.ok;
  };
  return { pending, error, submit };
}
