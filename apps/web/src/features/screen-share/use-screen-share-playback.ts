import { useEffect, useRef, useState } from 'react';

export function useScreenSharePlayback(stream: MediaStream | undefined) {
  const video = useRef<HTMLVideoElement>(null);
  const retry = useRef<(() => void) | undefined>(undefined);
  const [needsResume, setNeedsResume] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    let attempt = 0;
    setNeedsResume(false);

    const playing = () => {
      // Autoplay can succeed while an earlier play() request is still settling.
      attempt++;
      setNeedsResume(false);
    };
    const play = (retryInterrupted = true) => {
      const currentAttempt = ++attempt;
      void element.play().then(
        () => {
          if (active && currentAttempt === attempt) setNeedsResume(false);
        },
        (error: unknown) => {
          if (!active || currentAttempt !== attempt) return;
          if (
            retryInterrupted &&
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            play(false);
            return;
          }
          setNeedsResume(true);
        },
      );
    };

    element.addEventListener('playing', playing);
    element.muted = true;
    element.srcObject = stream ?? null;
    if (stream) {
      retry.current = () => play();
      play();
    }
    return () => {
      active = false;
      retry.current = undefined;
      element.removeEventListener('playing', playing);
      element.srcObject = null;
    };
  }, [stream]);

  return { video, needsResume, resume: () => retry.current?.() };
}
