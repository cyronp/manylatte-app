// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScreenSharePlayback } from './use-screen-share-playback';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const stream = { id: 'screen' } as MediaStream;
const play = vi.spyOn(HTMLMediaElement.prototype, 'play');

function Player({ stream }: { stream?: MediaStream }) {
  const { video, needsResume, resume } = useScreenSharePlayback(stream);
  return (
    <>
      <video ref={video} />
      {needsResume && <button onClick={resume}>Resume screen</button>}
    </>
  );
}

beforeEach(() => {
  play.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = (source: MediaStream | undefined = stream) =>
  act(async () => root.render(<Player stream={source} />));
const resumeButton = () => container.querySelector('button');
const pendingPlayback = () => {
  let reject!: (error: DOMException) => void;
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
};

it('starts muted playback automatically without a resume prompt', async () => {
  await render();
  expect(container.querySelector('video')?.muted).toBe(true);
  expect(container.querySelector('video')?.srcObject).toBe(stream);
  expect(play).toHaveBeenCalledOnce();
  expect(resumeButton()).toBeNull();
});

it('retries an interrupted request once, without showing a prompt if it recovers', async () => {
  play.mockRejectedValueOnce(new DOMException('Interrupted', 'AbortError'));
  await render();
  expect(play).toHaveBeenCalledTimes(2);
  expect(resumeButton()).toBeNull();
});

it('bounds automatic retries when interruptions continue', async () => {
  play.mockRejectedValue(new DOMException('Interrupted', 'AbortError'));
  await render();
  expect(play).toHaveBeenCalledTimes(2);
  expect(resumeButton()).not.toBeNull();
});

it('waits for a click when autoplay is blocked and clears the prompt on recovery', async () => {
  play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  await render();
  expect(play).toHaveBeenCalledOnce();
  expect(resumeButton()).not.toBeNull();
  await act(async () => resumeButton()!.click());
  expect(play).toHaveBeenCalledTimes(2);
  expect(resumeButton()).toBeNull();
});

it('ignores an obsolete request rejected after Strict Mode reattaches the same stream', async () => {
  const pending = pendingPlayback();
  play.mockReturnValueOnce(pending.promise);
  await act(async () =>
    root.render(
      <StrictMode>
        <Player stream={stream} />
      </StrictMode>,
    ),
  );
  expect(play).toHaveBeenCalledTimes(2);
  await act(async () =>
    pending.reject(new DOMException('Replaced', 'AbortError')),
  );
  expect(resumeButton()).toBeNull();
  expect(play).toHaveBeenCalledTimes(2);
});

it('ignores an old stream rejection after changing screens', async () => {
  const pending = pendingPlayback();
  play.mockReturnValueOnce(pending.promise);
  await render();
  const replacement = { id: 'replacement' } as MediaStream;
  await render(replacement);
  await act(async () =>
    pending.reject(new DOMException('Replaced', 'AbortError')),
  );
  expect(container.querySelector('video')?.srcObject).toBe(replacement);
  expect(resumeButton()).toBeNull();
});

it('clears a blocked prompt when native autoplay starts and ignores older failures', async () => {
  play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  await render();
  const pending = pendingPlayback();
  play.mockReturnValueOnce(pending.promise);
  await act(async () => resumeButton()!.click());
  await act(async () =>
    container.querySelector('video')!.dispatchEvent(new Event('playing')),
  );
  expect(resumeButton()).toBeNull();
  await act(async () =>
    pending.reject(new DOMException('Interrupted', 'AbortError')),
  );
  expect(resumeButton()).toBeNull();
  expect(play).toHaveBeenCalledTimes(2);
});

it('clears the prompt when watching stops and starts a replacement stream cleanly', async () => {
  play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  await render();
  expect(resumeButton()).not.toBeNull();
  await act(async () => root.render(<Player />));
  expect(resumeButton()).toBeNull();
  expect(container.querySelector('video')?.srcObject).toBeNull();
  await render({ id: 'next' } as MediaStream);
  expect(resumeButton()).toBeNull();
});
