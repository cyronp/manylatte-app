import { createElement, useEffect } from 'react';
import { toast } from 'sonner';
import { useSocket } from '@/components/socket-provider';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';

export function useInsertionShortcuts() {
  const { status, undoInsertion, redoInsertion } = useSocket();

  useEffect(() => {
    const applyHistory = async (direction: 'undo' | 'redo') => {
      const result = await (direction === 'undo'
        ? undoInsertion()
        : redoInsertion());
      if (result?.ok)
        toast.success(
          direction === 'undo'
            ? 'Canvas change undone'
            : 'Canvas change redone',
          {
            id: 'canvas-insertion-history',
            icon: createElement(
              direction === 'undo'
                ? ArrowCounterClockwiseIcon
                : ArrowClockwiseIcon,
              { size: 16 },
            ),
          },
        );
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        status !== 'connected' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="textbox"], [role="dialog"], [role="menu"]',
          ))
      )
        return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void applyHistory('undo');
      } else if (
        (key === 'y' && !event.shiftKey) ||
        (key === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        void applyHistory('redo');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [status, undoInsertion, redoInsertion]);
}
