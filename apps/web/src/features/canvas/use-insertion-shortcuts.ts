import { useEffect } from 'react';
import { useSocket } from '@/components/socket-provider';

export function useInsertionShortcuts() {
  const { status, undoInsertion, redoInsertion } = useSocket();

  useEffect(() => {
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
        void undoInsertion();
      } else if (
        (key === 'y' && !event.shiftKey) ||
        (key === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        void redoInsertion();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [status, undoInsertion, redoInsertion]);
}
