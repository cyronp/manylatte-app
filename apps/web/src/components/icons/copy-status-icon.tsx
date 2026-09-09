import { CheckIcon, SpinnerIcon, XIcon } from '@phosphor-icons/react';
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
        <SpinnerIcon
          className="animate-spin"
          style={{ animationDuration: `${spinnerDurationMs}ms` }}
          weight="bold"
        />
      ) : null}
      {status === 'copied' ? (
        <CheckIcon
          className="animate-in fade-in zoom-in-50"
          style={{ animationDuration: `${entranceDurationMs}ms` }}
          weight="bold"
        />
      ) : null}
      {status === 'error' ? (
        <XIcon
          className="animate-in fade-in zoom-in-50"
          style={{ animationDuration: `${entranceDurationMs}ms` }}
          weight="bold"
        />
      ) : null}
    </span>
  );
}
