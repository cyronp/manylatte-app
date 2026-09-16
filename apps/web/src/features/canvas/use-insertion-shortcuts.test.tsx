// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useInsertionShortcuts } from './use-insertion-shortcuts';
import { toast } from 'sonner';
import type { CanvasCommandResult } from '@app/shared';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const socket = vi.hoisted(() => ({
  status: 'connected',
  undoInsertion: vi.fn(),
  redoInsertion: vi.fn(),
}));
vi.mock('@/components/socket-provider', () => ({ useSocket: () => socket }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
function Shortcuts() {
  useInsertionShortcuts();
  return null;
}
const press = (
  key: string,
  target: EventTarget = window,
  options: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
};
beforeEach(async () => {
  vi.clearAllMocks();
  socket.undoInsertion.mockReset().mockResolvedValue(undefined);
  socket.redoInsertion.mockReset().mockResolvedValue(undefined);
  socket.status = 'connected';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Shortcuts />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('handles Ctrl+Z/Ctrl+Y and Mac shortcuts and removes its listener on unmount', async () => {
  expect(press('z').defaultPrevented).toBe(true);
  expect(press('y').defaultPrevented).toBe(true);
  press('z', window, { ctrlKey: false, metaKey: true });
  press('Z', window, { ctrlKey: false, metaKey: true, shiftKey: true });
  expect(socket.undoInsertion).toHaveBeenCalledTimes(2);
  expect(socket.redoInsertion).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null));
  press('z');
  expect(socket.undoInsertion).toHaveBeenCalledTimes(2);
});

it('preserves text editing and ignores dialogs, repeat, composition, and other modifiers', () => {
  for (const tag of ['input', 'textarea', 'select']) {
    const input = document.createElement(tag);
    container.append(input);
    expect(press('z', input).defaultPrevented).toBe(false);
    expect(press('y', input).defaultPrevented).toBe(false);
  }
  const editable = document.createElement('div');
  Object.defineProperty(editable, 'isContentEditable', { value: true });
  container.append(editable);
  expect(press('z', editable).defaultPrevented).toBe(false);
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  dialog.append(button);
  container.append(dialog);
  expect(press('z', button).defaultPrevented).toBe(false);
  for (const options of [
    { repeat: true },
    { isComposing: true },
    { altKey: true },
    { ctrlKey: false },
  ]) {
    expect(press('z', window, options).defaultPrevented).toBe(false);
  }
  expect(socket.undoInsertion).not.toHaveBeenCalled();
  expect(socket.redoInsertion).not.toHaveBeenCalled();
});

it('does not undo while disconnected', async () => {
  socket.status = 'disconnected';
  await act(async () => root.render(<Shortcuts />));
  expect(press('z').defaultPrevented).toBe(false);
  expect(socket.undoInsertion).not.toHaveBeenCalled();
});

it('shows a toast only after the server confirms undo or redo', async () => {
  let confirm!: (result: CanvasCommandResult) => void;
  socket.undoInsertion.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  press('z');
  expect(toast.success).not.toHaveBeenCalled();
  confirm({ ok: true, operationId: 'undo' });
  await Promise.resolve();
  expect(toast.success).toHaveBeenLastCalledWith(
    'Node insertion undone',
    expect.objectContaining({ id: 'canvas-insertion-history' }),
  );
  socket.redoInsertion.mockResolvedValueOnce({ ok: true, operationId: 'redo' });
  press('y');
  await Promise.resolve();
  expect(toast.success).toHaveBeenLastCalledWith(
    'Node restored',
    expect.objectContaining({ id: 'canvas-insertion-history' }),
  );
});

it('does not announce success for empty history or rejected edits', async () => {
  press('z');
  await Promise.resolve();
  socket.undoInsertion.mockResolvedValueOnce({
    ok: false,
    operationId: 'undo',
    code: 'storage',
    message: 'Try again.',
  });
  press('z');
  await Promise.resolve();
  expect(toast.success).not.toHaveBeenCalled();
});
