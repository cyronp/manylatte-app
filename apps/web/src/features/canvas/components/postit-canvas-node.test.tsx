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
const click = (selector: string) =>
  act(async () => {
    container.querySelector<HTMLElement>(selector)!.click();
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
  expect(
    container.querySelector('[aria-label="Post-it actions"]'),
  ).not.toBeNull();
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

it('opens actions on click and updates the color without overwriting text', async () => {
  socket.execute.mockResolvedValue({ ok: true });
  await render();
  expect(container.querySelector('[aria-label="Post-it actions"]')).toBeNull();
  await click('section');
  await click('[aria-label="Make Post-it blue"]');
  expect(socket.execute).toHaveBeenCalledWith({
    type: 'mutation',
    mutation: { action: 'update-postit', nodeId: 'note', color: 'blue' },
  });
  await render({ ...props, data: { ...props.data, color: 'blue' } });
  expect(
    container.querySelector('section')?.classList.contains('bg-blue-200'),
  ).toBe(true);
  expect(
    container
      .querySelector('[aria-label="Make Post-it blue"]')
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  await clickOutside();
  expect(container.querySelector('[aria-label="Post-it actions"]')).toBeNull();
});

it('removes a saved note and reports failed actions', async () => {
  socket.execute.mockResolvedValue({ ok: false, message: 'Try again' });
  await render();
  await click('section');
  await click('[aria-label="Remove Post-it"]');
  expect(socket.execute).toHaveBeenCalledWith({
    type: 'mutation',
    mutation: { action: 'delete', nodeId: 'note' },
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Try again',
  );
});

it('keeps actions local for a draft and saves its selected color on creation', async () => {
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
  await click('[aria-label="Make Post-it green"]');
  expect(socket.execute).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
  expect(
    container.querySelector('section')?.classList.contains('bg-green-200'),
  ).toBe(true);
  await edit('Saved note');
  await clickOutside();
  expect(socket.execute).toHaveBeenCalledWith({
    type: 'mutation',
    mutation: {
      action: 'create',
      node: {
        id: 'note',
        type: 'postit',
        position: { x: 20, y: 30 },
        data: { text: 'Saved note', color: 'green' },
      },
    },
  });
});

it('cancels a draft from its actions without saving it', async () => {
  const onCancel = vi.fn();
  await render({
    ...props,
    data: { ...props.data, draft: { position: { x: 20, y: 30 }, onCancel } },
  });
  await click('section');
  await click('[aria-label="Remove Post-it"]');
  expect(onCancel).toHaveBeenCalledOnce();
  expect(socket.execute).not.toHaveBeenCalled();
});

it('hides actions from visitors and disables saved-note actions while offline', async () => {
  socket.user = { userId: 'visitor' };
  await render();
  await click('section');
  expect(container.querySelector('[aria-label="Post-it actions"]')).toBeNull();
  socket.user = { userId: 'owner' };
  socket.status = 'disconnected';
  await render();
  await click('section');
  expect(
    [...container.querySelectorAll('button')].every(
      (button) => button.disabled,
    ),
  ).toBe(true);
  await click('[aria-label="Remove Post-it"]');
  expect(socket.execute).not.toHaveBeenCalled();
});

it('opens with the keyboard or right-click and dismisses with Escape', async () => {
  await render();
  await act(async () => {
    container
      .querySelector('section')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  expect(
    container.querySelector('[aria-label="Post-it actions"]'),
  ).not.toBeNull();
  await act(async () => {
    container
      .querySelector('button')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
  });
  expect(container.querySelector('[aria-label="Post-it actions"]')).toBeNull();
  await act(async () => {
    container
      .querySelector('section')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  });
  expect(
    container.querySelector('[aria-label="Post-it actions"]'),
  ).not.toBeNull();
});
