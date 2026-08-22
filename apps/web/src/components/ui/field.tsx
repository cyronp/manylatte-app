import type { ComponentProps } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function Field({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="field"
      className={cn('flex w-full flex-col gap-3', className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn('flex w-fit gap-2 leading-snug', className)}
      {...props}
    />
  );
}

function FieldError({ children, className, ...props }: ComponentProps<'div'>) {
  if (!children) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('text-sm font-normal text-destructive', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Field, FieldError, FieldLabel };
