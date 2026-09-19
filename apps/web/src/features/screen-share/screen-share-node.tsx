import { useEffect, useRef, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { ScreenShareState } from './screen-share-session';
import { Button } from '@/components/ui/button';
import { ArrowsInIcon, ArrowsInSimpleIcon, ArrowsOutIcon, ArrowsOutSimpleIcon, CaretDownIcon, MonitorIcon, StopIcon } from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export type ScreenShareNode = Node<
  ScreenShareState & {
    stop: () => void;
    changeScreen: () => void;
    watch: () => void;
    unwatch: () => void;
  },
  'screenShare'
>;

export function ScreenShareCanvasNode({ data }: NodeProps<ScreenShareNode>) {
  const video = useRef<HTMLVideoElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === panel);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [panel]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = data.stream ?? null;
    if (data.stream) void element.play().catch(() => setPlaybackError(true));
    return () => {
      element.srcObject = null;
    };
  }, [data.stream]);

  const watch = () => {
    setPlaybackError(false);
    data.watch();
  };
  return (
    <section
      ref={setPanel}
      aria-label={`Screen shared by ${data.share?.user.username}`}
      className="overflow-hidden rounded-xl border bg-background shadow-xl"
      style={{ width: expanded ? 800 : 480 }}
    >
      <header className="flex items-center justify-between gap-3 border-b p-3">
        <span className="text-sm font-medium">
          {data.share?.user.username}’s screen
        </span>
        <div
          className="nodrag nopan"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Screen share controls"
              >
                {data.changing ? 'Changing screen…' : 'Controls'}
                <CaretDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              portalContainer={fullscreen ? panel : undefined}
            >
              {data.local && (
                <DropdownMenuItem
                  disabled={data.changing}
                  onSelect={data.changeScreen}
                >
                  <MonitorIcon /> Change screen
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={fullscreen}
                onSelect={() => setExpanded(!expanded)}
              >
                {expanded ? <ArrowsInIcon/> : <ArrowsOutIcon/>}
                {expanded ? 'Shrink' : 'Expand'}
              </DropdownMenuItem>
              {data.stream && (
                <DropdownMenuItem
                  onSelect={() => {
                    if (fullscreen)
                      void document.exitFullscreen().catch(() => undefined);
                    else if (panel?.requestFullscreen)
                      void panel
                        .requestFullscreen()
                        .catch(() => setExpanded(true));
                    else setExpanded(true);
                  }}
                >
                  {fullscreen ? <ArrowsInSimpleIcon/> : <ArrowsOutSimpleIcon/>}
                  {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                </DropdownMenuItem>
              )}
              {(data.local || data.watching) && <DropdownMenuSeparator />}
              {data.local ? (
                <DropdownMenuItem variant="destructive" onSelect={data.stop}>
                  <StopIcon /> Stop sharing
                </DropdownMenuItem>
              ) : (
                data.watching && (
                  <DropdownMenuItem onSelect={data.unwatch}>
                    <StopIcon /> Stop watching
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="nodrag nopan relative aspect-video bg-black text-white">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Shared screen"
          className="h-full w-full object-contain"
        />
        {(!data.stream || data.status === 'connecting') && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center text-sm"
          >
            {data.status === 'connecting'
              ? 'Connecting to the shared screen…'
              : data.status === 'failed'
                ? 'Screen connection unavailable'
                : 'Watch this screen to join the presentation.'}
          </div>
        )}
      </div>
      {(data.error || playbackError || (!data.local && !data.watching)) && (
        <footer
          className="nodrag nopan space-y-2 p-3"
          onKeyDown={(event) => event.stopPropagation()}
        >
          {data.error && (
            <p role="alert" className="text-sm text-destructive">
              {data.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {playbackError && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void video.current
                    ?.play()
                    .then(() => setPlaybackError(false))
                    .catch(() => setPlaybackError(true));
                }}
              >
                Play video
              </Button>
            )}
            {!data.local && !data.watching && (
              <Button size="sm" onClick={watch}>
                {data.status === 'failed' ? 'Retry connection' : 'Watch screen'}
              </Button>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
