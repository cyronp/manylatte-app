import { io } from 'socket.io-client';
import { test, expect, type Page } from '@playwright/test';

async function join(page: Page, code: string, username: string) {
  await page.addInitScript(
    (name) => localStorage.setItem('manylatte:username', name),
    username,
  );
  await page.goto(`/?lobby=${code}`);
  await expect(
    page.getByRole('button', { name: 'Add message', exact: true }),
  ).toBeEnabled();
}

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
  await first.getByRole('button', { name: 'Add message', exact: true }).click();
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
  await expect(
    second.getByRole('button', { name: 'Add message', exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
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
  await expect(
    first.getByRole('button', { name: 'Add message', exact: true }),
  ).toBeEnabled();
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
  await page.getByRole('button', { name: 'Add reaction', exact: true }).click();
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
  for (const x of [700, 1000]) {
    const result = await publisher.timeout(3000).emitWithAck('canvas:command', {
      id: crypto.randomUUID(),
      body: {
        type: 'mutation',
        mutation: {
          action: 'create',
          node: {
            id: crypto.randomUUID(),
            type: 'emoji',
            position: { x, y: 500 },
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
  await expect(
    second.getByRole('button', { name: 'Add message', exact: true }),
  ).toBeEnabled();
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
