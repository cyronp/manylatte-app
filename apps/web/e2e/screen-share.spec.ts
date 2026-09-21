import { test, expect, type Page } from '@playwright/test';

async function join(page: Page, code: string, username: string) {
  await page.addInitScript(
    (name) => localStorage.setItem('manylatte:username', name),
    username,
  );
  await page.goto(`/?lobby=${code}`);
  await page
    .locator('.react-flow__pane')
    .click({ button: 'right', position: { x: 400, y: 250 } });
  await expect(
    page.getByRole('menuitem', { name: 'Message', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
}

async function captureFixture(page: Page) {
  await page.addInitScript(() => {
    let captureCount = 0;
    const streams: MediaStream[] = [];
    // Only replace the OS picker. Capture, encoding, transport, and playback use real browser media APIs.
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      value: async () => {
        const color = captureCount++ === 0 ? '#236fca' : '#23ca6f';
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d')!;
        const paint = () => {
          context.fillStyle = color;
          context.fillRect(0, 0, 640, 360);
          context.fillStyle = '#ffffff';
          context.fillText(`Screen share ${Date.now()}`, 40, 40);
        };
        paint();
        const timer = setInterval(paint, 100);
        const stream = canvas.captureStream(10);
        const track = stream.getVideoTracks()[0];
        track.addEventListener('ended', () => clearInterval(timer));
        streams.push(stream);
        Object.assign(window, {
          testScreenStream: stream,
          testScreenStreams: streams,
        });
        return stream;
      },
    });
  });
}

async function startSharing(page: Page) {
  await page
    .locator('.react-flow__pane')
    .click({ button: 'right', position: { x: 400, y: 250 } });
  await page
    .getByRole('menuitem', { name: 'Share screen', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Screen share controls', exact: true }),
  ).toBeVisible();
}

async function control(page: Page, name: string) {
  await page
    .getByRole('button', { name: 'Screen share controls', exact: true })
    .click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function expectVideo(page: Page) {
  await expect
    .poll(
      () =>
        page.locator('video').evaluate((video: HTMLVideoElement) => ({
          width: video.videoWidth,
          playing: video.currentTime > 0,
        })),
      { timeout: 20_000 },
    )
    .toEqual({ width: 640, playing: true });
}

test('streams real WebRTC video to late viewers, retries, moves the node, and cleans up on browser stop', async ({
  browser,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Screen sharing' },
  });
  const { code } = await response.json();
  const presenter = await browser.newPage();
  const viewer = await browser.newPage();
  const late = await browser.newPage();
  const errors: string[] = [];
  for (const page of [presenter, viewer, late])
    page.on('pageerror', (error) => errors.push(error.message));
  try {
    await captureFixture(presenter);
    await join(presenter, code, 'Presenter');
    await startSharing(presenter);
    await join(viewer, code, 'Viewer');
    await viewer
      .getByRole('button', { name: 'Watch screen', exact: true })
      .click();
    await expectVideo(viewer);
    await join(late, code, 'Late viewer');
    await late
      .getByRole('button', { name: 'Watch screen', exact: true })
      .click();
    await expectVideo(late);
    await control(viewer, 'Expand');
    await expect(
      viewer.locator('.react-flow__node-screenShare section'),
    ).toHaveCSS('width', '800px');
    await expect(
      presenter.locator('.react-flow__node-screenShare section'),
    ).toHaveCSS('width', '480px');
    await control(viewer, 'Shrink');
    await control(viewer, 'Fullscreen');
    await expect
      .poll(() => viewer.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    await control(viewer, 'Exit fullscreen');
    await expect
      .poll(() => viewer.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    const nodeId = await presenter
      .locator('.react-flow__node-screenShare')
      .getAttribute('data-id');
    const remoteTrack = await viewer
      .locator('video')
      .evaluate(
        (video: HTMLVideoElement) =>
          (video.srcObject as MediaStream).getVideoTracks()[0].id,
      );
    await control(presenter, 'Change screen');
    for (const page of [viewer, late]) {
      await expect
        .poll(() =>
          page.locator('video').evaluate((video: HTMLVideoElement) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d')!;
            context.drawImage(video, 0, 0, 1, 1);
            const pixel = context.getImageData(0, 0, 1, 1).data;
            return pixel[1] > pixel[2];
          }),
        )
        .toBe(true);
    }
    expect(
      await viewer
        .locator('video')
        .evaluate(
          (video: HTMLVideoElement) =>
            (video.srcObject as MediaStream).getVideoTracks()[0].id,
        ),
    ).toBe(remoteTrack);
    await expect(
      presenter.locator('.react-flow__node-screenShare'),
    ).toHaveAttribute('data-id', nodeId!);
    expect(
      await presenter.evaluate(() =>
        (
          window as unknown as { testScreenStreams: MediaStream[] }
        ).testScreenStreams[0]
          .getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    ).toBe(true);
    const node = presenter.locator('.react-flow__node-screenShare');
    const header = await node.locator('header').boundingBox();
    await presenter.mouse.move(header!.x + 40, header!.y + 15);
    await presenter.mouse.down();
    await presenter.mouse.move(header!.x + 140, header!.y + 65, { steps: 5 });
    await presenter.mouse.up();
    await expect
      .poll(() =>
        viewer.locator('.react-flow__node-screenShare').getAttribute('style'),
      )
      .toBe(await node.getAttribute('style'));
    await control(viewer, 'Stop watching');
    await viewer
      .getByRole('button', { name: 'Watch screen', exact: true })
      .click();
    await expectVideo(viewer);
    await presenter.evaluate(() => {
      const stream = (window as unknown as { testScreenStream: MediaStream })
        .testScreenStream;
      const track = stream.getVideoTracks()[0];
      track.stop();
      track.dispatchEvent(new Event('ended'));
    });
    for (const page of [presenter, viewer, late])
      await expect(page.locator('.react-flow__node-screenShare')).toHaveCount(
        0,
      );
    expect(errors).toEqual([]);
    await startSharing(presenter);
    await control(presenter, 'Stop sharing');
    await expect(viewer.locator('.react-flow__node-screenShare')).toHaveCount(
      0,
    );
    await expect(
      presenter.locator('.react-flow__node-screenShare'),
    ).toHaveCount(0);
    await startSharing(presenter);
    await presenter.reload();
    await expect(viewer.locator('.react-flow__node-screenShare')).toHaveCount(
      0,
    );
  } finally {
    await Promise.all([presenter.close(), viewer.close(), late.close()]);
  }
});

test('cancelled capture leaves no node and allows another attempt', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:3000/lobbies', {
    data: { name: 'Cancelled sharing' },
  });
  const { code } = await response.json();
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      value: async () => {
        throw new DOMException('Cancelled', 'NotAllowedError');
      },
    }),
  );
  await join(page, code, 'Presenter');
  await page
    .locator('.react-flow__pane')
    .click({ button: 'right', position: { x: 400, y: 250 } });
  await page
    .getByRole('menuitem', { name: 'Share screen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'cancelled or permission was denied',
  );
  await expect(page.locator('.react-flow__node-screenShare')).toHaveCount(0);
  await page
    .locator('.react-flow__pane')
    .click({ button: 'right', position: { x: 400, y: 250 } });
  await expect(
    page.getByRole('menuitem', { name: 'Share screen', exact: true }),
  ).toBeEnabled();
});

test('kicking a presenter stops capture and removes the screen from remaining viewers', async ({
  browser,
}) => {
  const owner = await browser.newPage();
  const presenter = await browser.newPage();
  try {
    await owner.addInitScript(() =>
      localStorage.setItem('manylatte:username', 'Owner'),
    );
    await owner.goto('/');
    await owner
      .getByRole('button', { name: 'Create lobby', exact: true })
      .click();
    await owner
      .getByRole('textbox', { name: 'Lobby name' })
      .fill('Moderated screen');
    await owner.getByRole('button', { name: 'Create and join lobby' }).click();
    await expect(owner).toHaveURL(/lobby=/);
    const code = new URL(owner.url()).searchParams.get('lobby')!;
    await captureFixture(presenter);
    await join(presenter, code, 'Presenter');
    await startSharing(presenter);
    await owner
      .getByRole('button', { name: 'Watch screen', exact: true })
      .click();
    await expectVideo(owner);
    await owner.getByRole('button', { name: 'Open user menu' }).click();
    await owner.getByRole('menuitem', { name: 'Lobby Users' }).click();
    await owner
      .getByRole('button', { name: 'Kick Presenter', exact: true })
      .click();
    await expect(
      presenter.getByRole('alertdialog', {
        name: 'You were kicked from this lobby',
      }),
    ).toBeVisible();
    await expect(owner.locator('.react-flow__node-screenShare')).toHaveCount(0);
    expect(
      await presenter.evaluate(() =>
        (
          window as unknown as { testScreenStream: MediaStream }
        ).testScreenStream
          .getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    ).toBe(true);
  } finally {
    await Promise.all([owner.close(), presenter.close()]);
  }
});
