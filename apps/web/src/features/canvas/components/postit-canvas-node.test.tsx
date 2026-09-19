// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NodeProps } from '@xyflow/react';
import { PostitCanvasNode, type PostitNode } from './postit-canvas-node';

const socket = vi.hoisted(() => ({
  user: { userId: 'owner' },
  status: 'connected',
  execute: vi.fn(),
}));
vi.mock('@/components/socket-provider', () => ({ useSocket: () => socket }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const props = {
  id: 'note',
  data: {
    text: 'Saved note',
    user: { userId: 'owner', username: 'Alice', color: '#193CB8' },
  },
} as NodeProps<PostitNode>;
beforeEach(() => {
  socket.user = { userId: 'owner' };
  socket.status = 'connected';
  socket.execute.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = (nodeProps = props) =>
  act(async () => root.render(<PostitCanvasNode {...nodeProps} />));
const clickOutside = () =>
  act(async () => {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
const startEditing = () =>
  act(async () => {
    container
      .querySelector('section')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
const edit = async (value: string) => {
  const textarea = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

it('only shows the inline editor to the owner', async () => {
  await render();
  expect(container.querySelector('textarea')).toBeNull();
  await startEditing();
  expect(container.querySelector('textarea')?.value).toBe('Saved note');
  socket.user = { userId: 'visitor' };
  await render();
  await startEditing();
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.textContent).toContain('Saved note');
});

it('preserves failed edits for retry and disables saving while offline', async () => {
  socket.execute.mockResolvedValue({
    ok: false,
    message: 'Storage unavailable',
  });
  await render();
  await startEditing();
  await edit('New note\nSecond line');
  await clickOutside();
  expect(socket.execute).toHaveBeenCalledWith({
    type: 'mutation',
    mutation: {
      action: 'update-postit',
      nodeId: 'note',
      text: 'New note\nSecond line',
    },
  });
  expect(container.querySelector('textarea')?.value).toBe(
    'New note\nSecond line',
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Storage unavailable',
  );
  socket.status = 'disconnected';
  await render();
  await clickOutside();
  expect(socket.execute).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Reconnect');
});

it('returns to dragging after saving and supports keyboard editing', async () => {
  socket.execute.mockResolvedValue({ ok: true });
  await render();
  await act(async () => {
    container
      .querySelector('section')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
  });
  await edit('Updated note');
  await clickOutside();
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('.nodrag')).toBeNull();
});

it('creates a new Post-it only after text is entered and clicked outside', async () => {
  socket.execute.mockResolvedValue({ ok: true });
  const onCancel = vi.fn();
  await render({
    ...props,
    data: {
      ...props.data,
      text: '',
      draft: { position: { x: 20, y: 30 }, onCancel },
    },
  });
  expect(container.querySelector('textarea')).not.toBeNull();
  expect(container.querySelector('button')).toBeNull();
  expect(socket.execute).not.toHaveBeenCalled();
  await edit('First line\nSecond line');
  expect(socket.execute).not.toHaveBeenCalled();
  await clickOutside();
  expect(socket.execute).toHaveBeenCalledWith({
    type: 'mutation',
    mutation: {
      action: 'create',
      node: {
        id: 'note',
        type: 'postit',
        position: { x: 20, y: 30 },
        data: { text: 'First line\nSecond line' },
      },
    },
  });
  expect(onCancel).not.toHaveBeenCalled();
});

it('discards whitespace-only drafts without sending a command', async () => {
  const onCancel = vi.fn();
  await render({
    ...props,
    data: {
      ...props.data,
      text: '',
      draft: { position: { x: 20, y: 30 }, onCancel },
    },
  });
  await edit('  \n ');
  await clickOutside();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(socket.execute).not.toHaveBeenCalled();
});

it('does not submit twice when pointer and focus leave during a pending save', async () => {
  let resolve!: (value: { ok: true }) => void;
  socket.execute.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  await startEditing();
  await edit('Changed');
  await clickOutside();
  await act(async () => {
    document.body.dispatchEvent(new Event('focusin', { bubbles: true }));
  });
  expect(socket.execute).toHaveBeenCalledOnce();
  await act(async () => resolve({ ok: true }));
  expect(container.querySelector('textarea')).toBeNull();
});
