import { CheckIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import { cn } from 'cn';
import type { CopyStatus } from '@/lib/use-copy-to-clipboard';

interface CopyStatusIconProps {
  status: CopyStatus;
  spinnerDurationMs?: number;
  entranceDurationMs?: number;
  className?: string;
}

export function CopyStatusIcon({
  status,
  spinnerDurationMs = 600,
  entranceDurationMs = 200,
  className,
}: CopyStatusIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center',
        className,
      )}
      data-status={status}
    >
      {status === 'copying' ? (
        <LoaderCircleIcon
          className="animate-spin"
          style={{ animationDuration: `${spinnerDurationMs}ms` }}
          strokeWidth={2.5}
        />
      ) : null}
      {status === 'copied' ? (
        <CheckIcon
          className="animate-in fade-in zoom-in-50"
          style={{ animationDuration: `${entranceDurationMs}ms` }}
          strokeWidth={2.5}
        />
      ) : null}
      {status === 'error' ? (
        <XIcon
          className="animate-in fade-in zoom-in-50"
          style={{ animationDuration: `${entranceDurationMs}ms` }}
          strokeWidth={2.5}
        />
      ) : null}
    </span>
  );
}
