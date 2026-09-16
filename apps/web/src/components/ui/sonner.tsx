import {
  CheckCircleIcon,
  InfoIcon,
  SpinnerIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useAppearance } from '@/components/appearance-provider';
import { buttonVariants } from '@/components/ui/button';

const Toaster = ({
  className,
  style,
  icons,
  toastOptions,
  ...props
}: ToasterProps) => {
  const { isDark } = useAppearance();

  return (
    <Sonner
      theme={isDark ? 'dark' : 'light'}
      className={cn(
        'toaster group [&_[data-close-button]]:hidden! [&_[data-description]]:hidden!',
        className,
      )}
      icons={{
        success: <CheckCircleIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <WarningIcon className="size-5" />,
        error: <XCircleIcon className="size-5" />,
        loading: <SpinnerIcon className="size-5 animate-spin" />,
        ...icons,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-3xl)',
          fontFamily: 'var(--font-sans)',
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        closeButton: false,
        classNames: {
          toast:
            'cn-toast group/toast flex flex-row w-full items-center gap-2 items-center justify-center rounded-3xl bg-popover py-4 px-4 font-sans text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 dark:ring-foreground/10 data-[type=error]:bg-red-50 data-[type=error]:text-red-900 data-[type=success]:bg-green-50 data-[type=success]:text-green-900 dark:data-[type=error]:bg-red-950 dark:data-[type=error]:text-red-100 dark:data-[type=success]:bg-green-950 dark:data-[type=success]:text-green-100 focus-visible:ring-2 focus-visible:ring-ring',
          icon: 'relative flex size-6 shrink-0 items-center justify-center text-inherit [&_svg]:shrink-0',
          content: 'flex min-w-0 flex-1 flex-col gap-1',
          title: 'text-sm leading-5 font-medium',
          actionButton: cn(
            buttonVariants({ size: 'xs' }),
            'group-data-[type=error]/toast:bg-destructive group-data-[type=error]/toast:text-white group-data-[type=error]/toast:hover:bg-destructive/90',
          ),
          cancelButton: cn(
            buttonVariants({ variant: 'ghost', size: 'xs' }),
            'text-inherit group-data-[type=error]/toast:hover:bg-destructive/10 group-data-[type=error]/toast:hover:text-inherit',
          ),
          ...toastOptions?.classNames,
        },
      }}
      {...props}
      closeButton={false}
    />
  );
};

export { Toaster };
