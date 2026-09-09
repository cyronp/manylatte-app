import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyStatus = 'idle' | 'copying' | 'copied' | 'error';

interface UseCopyToClipboardOptions {
  minimumLoadingDurationMs?: number;
  successDurationMs?: number;
  errorDurationMs?: number;
}

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

export function useCopyToClipboard({
  minimumLoadingDurationMs = 600,
  successDurationMs = 1800,
  errorDurationMs = 3000,
}: UseCopyToClipboardOptions = {}) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const attempt = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reset = useCallback(() => {
    attempt.current += 1;
    clearTimeout(resetTimer.current);
    setStatus('idle');
  }, []);

  useEffect(
    () => () => {
      attempt.current += 1;
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(
    async (value: string) => {
      const currentAttempt = ++attempt.current;
      clearTimeout(resetTimer.current);
      setStatus('copying');

      const copySucceeded = Promise.resolve()
        .then(() => navigator.clipboard.writeText(value))
        .then(
          () => true,
          () => false,
        );

      const [succeeded] = await Promise.all([
        copySucceeded,
        wait(minimumLoadingDurationMs),
      ]);

      if (attempt.current !== currentAttempt) return false;

      setStatus(succeeded ? 'copied' : 'error');
      resetTimer.current = setTimeout(
        () => {
          if (attempt.current === currentAttempt) setStatus('idle');
        },
        succeeded ? successDurationMs : errorDurationMs,
      );

      return succeeded;
    },
    [errorDurationMs, minimumLoadingDurationMs, successDurationMs],
  );

  return { status, copy, reset };
}
