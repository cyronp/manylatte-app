import { io } from 'socket.io-client';
import { test, expect, type Page } from '@playwright/test';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@app/shared';

async function join(page: Page, code: string, username: string) {
  await page.addInitScript(
    (name) => localStorage.setItem('manylatte:username', name),
    username,
  );
  await page.goto(`/?lobby=${code}`);
  await expect(
    page.getByRole('button', { name: 'Add message', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add reaction', exact: true }),
  ).toHaveCount(0);
  await openCanvasMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Message' })).toBeEnabled();
  await page.keyboard.press('Escape');
}

async function openCanvasMenu(page: Page) {
  await page.locator('.react-flow__pane').click({
    button: 'right',
    position: { x: 400, y: 300 },
  });
}

test('Post-it colors and shared canvas deletion sync across clients', async ({
  browser,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Post-it actions' },
  });
  const lobby = await response.json();
  const owner = await browser.newPage();
  const viewer = await browser.newPage();
  try {
    await join(owner, lobby.code, 'Alice');
    await join(viewer, lobby.code, 'Bob');
    await openCanvasMenu(owner);
    await owner.getByRole('menuitem', { name: 'Post-it', exact: true }).click();
    await expect(
      owner.getByRole('group', { name: 'Post-it actions' }),
    ).toBeVisible();
    await owner.getByRole('button', { name: 'Make Post-it green' }).click();
    await expect(viewer.locator('.react-flow__node-postit')).toHaveCount(0);
    await owner
      .getByRole('textbox', { name: 'Post-it text' })
      .fill('A colorful note');
    await owner
      .locator('.react-flow__pane')
      .click({ position: { x: 100, y: 100 } });
    const note = owner.locator('.react-flow__node-postit section');
    const peerNote = viewer.locator('.react-flow__node-postit section');
    await expect(peerNote).toContainText('A colorful note');
    await expect(peerNote).toHaveClass(/bg-green-200/);
    await note.click();
    const actions = owner.getByRole('group', { name: 'Post-it actions' });
    await expect(actions).toBeVisible();
    const bounds = await note.boundingBox();
    const menuBounds = await actions.boundingBox();
    expect(bounds!.width).toBeCloseTo(bounds!.height, 0);
    expect(menuBounds!.y).toBeGreaterThan(bounds!.y + bounds!.height);
    const deleteBounds = await owner
      .getByRole('group', { name: 'Selection actions' })
      .boundingBox();
    expect(deleteBounds!.y + deleteBounds!.height).toBeLessThan(bounds!.y);
    await expect(
      owner.getByRole('button', { name: 'Remove Post-it' }),
    ).toHaveCount(0);
    await owner.getByRole('button', { name: 'Make Post-it blue' }).click();
    await expect(peerNote).toHaveClass(/bg-blue-200/);
    await owner.reload();
    await expect(note).toHaveClass(/bg-blue-200/);
    await note.click();
    await owner.getByRole('button', { name: 'Delete selected items' }).click();
    await expect(note).toHaveCount(0);
    await expect(peerNote).toHaveCount(0);

    // Deleting an unfinished draft must not trigger an outside-click save.
    await openCanvasMenu(owner);
    await owner.getByRole('menuitem', { name: 'Post-it', exact: true }).click();
    await owner
      .getByRole('textbox', { name: 'Post-it text' })
      .fill('Discard this draft');
    await owner.getByRole('button', { name: 'Delete selected items' }).click();
    await expect(note).toHaveCount(0);
    await owner.reload();
    await openCanvasMenu(owner);
    await expect(
      owner.getByRole('menuitem', { name: 'Post-it', exact: true }),
    ).toBeEnabled();
    await owner.keyboard.press('Escape');
    await expect(note).toHaveCount(0);
    await expect(peerNote).toHaveCount(0);
  } finally {
    await owner.close();
    await viewer.close();
  }
});

test('Ctrl+Z and Ctrl+Y undo and restore only this participant’s node insertions', async ({
  browser,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Insertion history' },
  });
  const lobby = await response.json();
  const first = await browser.newPage();
  const second = await browser.newPage();
  const violations: string[] = [];
  first.on('console', (message) => {
    if (/Content Security Policy|violates the following/.test(message.text()))
      violations.push(message.text());
  });
  try {
    await join(first, lobby.code, 'Alice');
    await join(second, lobby.code, 'Bob');
    await openCanvasMenu(first);
    await first.getByRole('menuitem', { name: 'Reaction' }).click();
    await expect(first.locator('.EmojiPickerReact')).toBeVisible();
    await first.locator('.EmojiPickerReact button.epr-emoji').first().click();
    const reactions = (page: Page) => page.locator('.react-flow__node-emoji');
    await expect(reactions(second)).toHaveCount(1);
    const reactionId = await reactions(first).getAttribute('data-id');
    const reactionPosition = await reactions(first).evaluate(
      (node) => (node as HTMLElement).style.transform,
    );
    // A peer's insertion never enters Bob's undo history.
    await second.keyboard.press('Control+z');
    await expect(reactions(second)).toHaveCount(1);
    await first
      .locator('.react-flow__pane')
      .click({ position: { x: 100, y: 100 } });
    await first.keyboard.press('Control+z');
    await expect(reactions(first)).toHaveCount(0);
    await expect(reactions(second)).toHaveCount(0);
    await expect(first.locator('[data-sonner-toast]')).toContainText(
      'Node insertion undone',
    );
    await expect(second.locator('[data-sonner-toast]')).toHaveCount(0);
    await first.keyboard.press('Control+y');
    await expect(reactions(second)).toHaveCount(1);
    await expect(first.locator('[data-sonner-toast]')).toContainText(
      'Node restored',
    );
    expect(
      await first
        .locator('[data-sonner-toast]')
        .evaluate((node) => getComputedStyle(node).position),
    ).toBe('absolute');
    await expect(reactions(first)).toHaveAttribute('data-id', reactionId!);
    expect(
      await reactions(first).evaluate(
        (node) => (node as HTMLElement).style.transform,
      ),
    ).toBe(reactionPosition);

    await openCanvasMenu(first);
    await first.getByRole('menuitem', { name: 'Message' }).click();
    await first
      .getByRole('textbox', { name: 'First message', exact: true })
      .fill('Restore this message');
    // Text undo must not remove the previously inserted reaction.
    await first.keyboard.press('Control+z');
    await expect(reactions(second)).toHaveCount(1);
    await first
      .getByRole('textbox', { name: 'First message', exact: true })
      .fill('Restore this message');
    await first
      .getByRole('button', { name: 'Create message', exact: true })
      .click();
    const messages = (page: Page) => page.locator('.react-flow__node-message');
    await expect(messages(second)).toHaveCount(1);
    const messageId = await messages(first).getAttribute('data-id');
    await first
      .locator('.react-flow__pane')
      .click({ position: { x: 100, y: 100 } });
    await first.keyboard.press('Control+z');
    await expect(messages(second)).toHaveCount(0);
    await expect(reactions(second)).toHaveCount(1);
    await first.keyboard.press('Control+y');
    await expect(messages(second)).toHaveCount(1);
    await expect(messages(first)).toHaveAttribute('data-id', messageId!);
    await second
      .getByRole('button', { name: 'Open messages', exact: true })
      .click();
    await expect(
      second.getByText('Restore this message', { exact: true }).last(),
    ).toBeVisible();
    expect(violations).toEqual([]);
    await second
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Reply stays safe');
    await second
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      second.getByRole('textbox', { name: 'Message', exact: true }),
    ).toHaveValue('');
    await first.keyboard.press('Control+z');
    await expect(first.getByRole('alert')).toHaveText(
      /conversation has received replies/,
    );
    await expect(messages(second)).toHaveCount(1);
    await second.reload();
    await expect(messages(second)).toHaveCount(1);
    await second
      .getByRole('button', { name: 'Open messages', exact: true })
      .click();
    await expect(
      second.getByText('Reply stays safe', { exact: true }).last(),
    ).toBeVisible();
    await expect(
      second.getByText('Restore this message', { exact: true }).last(),
    ).toBeVisible();
  } finally {
    await first.close();
    await second.close();
  }
});

test('starts centered and provides canvas zoom controls', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Centered canvas' },
  });
  const lobby = await response.json();

  await join(page, lobby.code, 'Centered user');

  const canvasBounds = await page.locator('[data-canvas-width]').boundingBox();
  const viewport = page.viewportSize();
  if (!canvasBounds || !viewport) throw new Error('Missing canvas viewport');

  expect(
    await page
      .locator('[data-canvas-width]')
      .evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none');

  expect(canvasBounds.x + canvasBounds.width / 2).toBeCloseTo(
    viewport.width / 2,
    0,
  );
  expect(canvasBounds.y + canvasBounds.height / 2).toBeCloseTo(
    viewport.height / 2,
    0,
  );

  const controlsBounds = await page
    .getByRole('toolbar', { name: 'Canvas controls' })
    .boundingBox();
  if (!controlsBounds) throw new Error('Missing canvas controls');
  expect(controlsBounds.x + controlsBounds.width).toBeCloseTo(
    viewport.width - 16,
    0,
  );
  expect(controlsBounds.y + controlsBounds.height).toBeCloseTo(
    viewport.height - 16,
    0,
  );

  const viewportTransform = page.locator('.react-flow__viewport');
  const initialTransform = await viewportTransform.getAttribute('style');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect
    .poll(() => viewportTransform.getAttribute('style'))
    .not.toBe(initialTransform);

  const zoomedInTransform = await viewportTransform.getAttribute('style');
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect
    .poll(() => viewportTransform.getAttribute('style'))
    .not.toBe(zoomedInTransform);

  await expect(page.getByLabel('Current zoom')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Center canvas' })).toHaveCount(
    0,
  );
});

test('two clients keep saved messages and keyboard moves/deletes in sync through restart', async ({
  browser,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Browser collaboration' },
  });
  const lobby = await response.json();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await join(first, lobby.code, 'Alice');
  await join(second, lobby.code, 'Bob');
  await openCanvasMenu(first);
  await first.getByRole('menuitem', { name: 'Message' }).click();
  await first
    .getByRole('textbox', { name: 'First message', exact: true })
    .fill('Atomic first message');
  await request.post('/test/fail');
  await first
    .getByRole('button', { name: 'Create message', exact: true })
    .click();
  await expect(
    first.getByRole('textbox', { name: 'First message', exact: true }),
  ).toHaveValue('Atomic first message');
  await expect(
    first.getByText(/edit could not be saved/).first(),
  ).toBeVisible();
  await expect(second.locator('.react-flow__node-message')).toHaveCount(0);
  await request.post('/test/recover');
  await first
    .getByRole('button', { name: 'Create message', exact: true })
    .click();
  await expect(second.locator('.react-flow__node-message')).toHaveCount(1);
  await second
    .getByRole('button', { name: 'Open messages', exact: true })
    .click();
  await expect(
    second.getByText('Atomic first message', { exact: true }).last(),
  ).toBeVisible();
  await second
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Draft survives reconnect');
  await request.post('/test/restart');
  await expect(second.getByRole('button', { name: 'Reconnect' })).toHaveCount(
    0,
    {
      timeout: 15_000,
    },
  );
  await expect(
    second.getByRole('textbox', { name: 'Message', exact: true }),
  ).toHaveValue('Draft survives reconnect');
  await second
    .getByRole('button', { name: 'Send message', exact: true })
    .click();
  await expect(
    second.getByRole('textbox', { name: 'Message', exact: true }),
  ).toHaveValue('');
  await second
    .getByRole('button', { name: 'Close messages', exact: true })
    .last()
    .click();
  const node = first.locator('.react-flow__node-message');
  await node.focus();
  await node.press('ArrowRight');
  await expect
    .poll(() =>
      second
        .locator('.react-flow__node-message')
        .evaluate((element) => (element as HTMLElement).style.transform),
    )
    .toBe(
      await node.evaluate(
        (element) => (element as HTMLElement).style.transform,
      ),
    );
  await node.press('Enter');
  await node.press('Delete');
  await expect(second.locator('.react-flow__node-message')).toHaveCount(0);
  await first.reload();
  await openCanvasMenu(first);
  await expect(first.getByRole('menuitem', { name: 'Message' })).toBeEnabled();
  await first.keyboard.press('Escape');
  await expect(first.locator('.react-flow__node-message')).toHaveCount(0);
  await firstContext.close();
  await secondContext.close();
});

test('production CSP allows pickers and dialogs and the join screen fits 320px', async ({
  page,
  request,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|violates the following/.test(message.text()))
      violations.push(message.text());
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expect(page.getByLabel('Lobby code', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'CSP browser' },
  });
  const lobby = await response.json();
  await page.setViewportSize({ width: 1280, height: 800 });
  await join(page, lobby.code, 'CSP user');
  await openCanvasMenu(page);
  await page.getByRole('menuitem', { name: 'Reaction' }).click();
  await expect(page.getByPlaceholder('Search emojis')).toBeVisible();
  expect(
    await page
      .locator('.EmojiPickerReact')
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe('relative');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByRole('menuitem', { name: 'Change Color' }).hover();
  await expect(page.getByRole('slider', { name: 'Hue' })).toBeVisible();
  expect(
    await page
      .locator('.react-colorful')
      .evaluate((element) => getComputedStyle(element).display),
  ).toBe('flex');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('group dragging persists every selected node', async ({
  browser,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Group moves' },
  });
  const lobby = await response.json();
  const publisher = io('http://127.0.0.1:3000', {
    auth: { roomId: lobby.id, username: 'Seeder' },
    autoConnect: false,
  });
  const ready = new Promise((resolve) =>
    publisher.once('canvas:snapshot', resolve),
  );
  publisher.connect();
  await ready;
  for (const x of [CANVAS_WIDTH / 2 - 150, CANVAS_WIDTH / 2 + 150]) {
    const result = await publisher.timeout(3000).emitWithAck('canvas:command', {
      id: crypto.randomUUID(),
      body: {
        type: 'mutation',
        mutation: {
          action: 'create',
          node: {
            id: crypto.randomUUID(),
            type: 'emoji',
            position: { x, y: CANVAS_HEIGHT / 2 },
            data: { emoji: '☕', label: 'Coffee' },
          },
        },
      },
    });
    expect(result.ok).toBe(true);
  }
  publisher.disconnect();
  const first = await browser.newPage();
  const second = await browser.newPage();
  await join(first, lobby.code, 'Alice');
  await join(second, lobby.code, 'Bob');
  const nodes = first.locator('.react-flow__node-emoji');
  await expect(nodes).toHaveCount(2);
  const before = await nodes.evaluateAll((items) =>
    items.map((node) => (node as HTMLElement).style.transform),
  );
  await nodes.nth(0).click();
  await first.keyboard.down('Control');
  await nodes.nth(1).click();
  await first.keyboard.up('Control');
  await expect(first.locator('.react-flow__node.selected')).toHaveCount(2);
  const bounds = await nodes.nth(0).boundingBox();
  if (!bounds) throw new Error('Missing reaction bounds');
  await first.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await first.mouse.down();
  await first.mouse.move(
    bounds.x + bounds.width / 2 + 80,
    bounds.y + bounds.height / 2 + 40,
    { steps: 8 },
  );
  await first.mouse.up();
  const after = await nodes.evaluateAll((items) =>
    items.map((node) => (node as HTMLElement).style.transform),
  );
  expect(after[0]).not.toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
  await expect
    .poll(() =>
      second
        .locator('.react-flow__node-emoji')
        .evaluateAll((items) =>
          items.map((node) => (node as HTMLElement).style.transform),
        ),
    )
    .toEqual(after);
  await second.reload();
  await openCanvasMenu(second);
  await expect(second.getByRole('menuitem', { name: 'Message' })).toBeEnabled();
  await second.keyboard.press('Escape');
  await expect
    .poll(() =>
      second
        .locator('.react-flow__node-emoji')
        .evaluateAll((items) =>
          items.map((node) => (node as HTMLElement).style.transform),
        ),
    )
    .toEqual(after);
  await first.close();
  await second.close();
});

test('box selection and select-all delete groups across clients and reloads', async ({
  browser,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Group deletion' },
  });
  const lobby = await response.json();
  const publisher = io('http://127.0.0.1:3000', {
    auth: { roomId: lobby.id, username: 'Seeder' },
    autoConnect: false,
  });
  const owner = await browser.newPage();
  const viewer = await browser.newPage();
  try {
    const ready = new Promise((resolve) =>
      publisher.once('canvas:snapshot', resolve),
    );
    publisher.connect();
    await ready;
    for (const offset of [-200, 0, 200]) {
      const result = await publisher
        .timeout(3000)
        .emitWithAck('canvas:command', {
          id: crypto.randomUUID(),
          body: {
            type: 'mutation',
            mutation: {
              action: 'create',
              node: {
                id: crypto.randomUUID(),
                type: 'emoji',
                position: {
                  x: CANVAS_WIDTH / 2 + offset,
                  y: CANVAS_HEIGHT / 2,
                },
                data: { emoji: '☕', label: 'Coffee' },
              },
            },
          },
        });
      expect(result.ok).toBe(true);
    }
    await join(owner, lobby.code, 'Alice');
    await join(viewer, lobby.code, 'Bob');
    const nodes = owner.locator('.react-flow__node-emoji');
    const selected = owner.locator('.react-flow__node.selected');
    const actions = owner.getByRole('group', { name: 'Selection actions' });
    await expect(nodes).toHaveCount(3);
    await owner.keyboard.press('Control+a');
    await expect(selected).toHaveCount(3);
    await expect(actions).toContainText('3 selected');
    await owner
      .locator('.react-flow__pane')
      .click({ position: { x: 100, y: 100 } });
    await expect(actions).toHaveCount(0);

    const first = await nodes.nth(0).boundingBox();
    const second = await nodes.nth(1).boundingBox();
    if (!first || !second) throw new Error('Missing reaction bounds');
    await owner.mouse.move(first.x - 15, first.y - 15);
    await owner.mouse.down();
    // Partial overlap includes the second node without reaching the third.
    await owner.mouse.move(
      second.x + second.width / 2,
      second.y + second.height + 15,
      { steps: 8 },
    );
    await owner.mouse.up();
    await expect(selected).toHaveCount(2);
    await expect(actions).toContainText('2 selected');
    const toolbar = await actions.boundingBox();
    expect(toolbar!.y + toolbar!.height).toBeLessThan(first.y);
    expect(toolbar!.x + toolbar!.width / 2).toBeCloseTo(
      (first.x + second.x + second.width) / 2,
      0,
    );
    await owner.getByRole('button', { name: 'Delete selected items' }).click();
    await expect(nodes).toHaveCount(1);
    await expect(viewer.locator('.react-flow__node-emoji')).toHaveCount(1);
    await expect(actions).toHaveCount(0);
    await viewer.reload();
    await expect(viewer.locator('.react-flow__node-emoji')).toHaveCount(1);

    // The platform-independent select-all shortcut also supports Command.
    await owner.keyboard.press('Meta+a');
    await expect(selected).toHaveCount(1);
    await owner.keyboard.press('Delete');
    await expect(nodes).toHaveCount(0);
    await expect(viewer.locator('.react-flow__node-emoji')).toHaveCount(0);
  } finally {
    publisher.disconnect();
    await owner.close();
    await viewer.close();
  }
});
