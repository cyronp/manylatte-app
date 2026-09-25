import { useEffect, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { ScreenShareState } from './screen-share-session';
import { useScreenSharePlayback } from './use-screen-share-playback';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ShrinkIcon,
  MinimizeIcon,
  ExpandIcon,
  MaximizeIcon,
  EllipsisIcon,
  MonitorIcon,
  PlayIcon,
  ScreenShareIcon,
  SquareIcon,
} from 'lucide-react';
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
  const { video, needsResume, resume } = useScreenSharePlayback(data.stream);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === panel);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [panel]);
  const waiting = !data.stream || data.status === 'connecting';
  return (
    <section
      ref={setPanel}
      aria-label={`Screen shared by ${data.share?.user.username}`}
      className={cn(
        'flex flex-col gap-3',
        fullscreen && 'h-full bg-background p-4',
      )}
      style={{ width: fullscreen ? '100%' : expanded ? 800 : 480 }}
    >
      <header className="flex w-full shrink-0 items-center justify-between gap-3 rounded-full border bg-popover px-4 py-2 text-popover-foreground shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">
            {data.share?.user.username}’s screen
          </span>
        </div>
        <div
          className="nodrag nopan flex shrink-0 items-center gap-0.5"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={expanded ? 'Shrink screen' : 'Expand screen'}
            title={expanded ? 'Shrink screen' : 'Expand screen'}
            disabled={fullscreen}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Screen share controls"
                title="More options"
              >
                <EllipsisIcon className="size-5" strokeWidth={2.5} />
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
                {expanded ? <ShrinkIcon /> : <ExpandIcon />}
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
                  {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
                  {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                </DropdownMenuItem>
              )}
              {(data.local || data.watching) && <DropdownMenuSeparator />}
              {data.local ? (
                <DropdownMenuItem variant="destructive" onSelect={data.stop}>
                  <SquareIcon /> Stop sharing
                </DropdownMenuItem>
              ) : (
                data.watching && (
                  <DropdownMenuItem onSelect={data.unwatch}>
                    <SquareIcon /> Stop watching
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div
        className={cn(
          'nodrag nopan relative w-full overflow-hidden rounded-2xl border bg-popover shadow-sm',
          fullscreen ? 'min-h-0 flex-1' : 'aspect-video',
          !waiting && 'bg-black',
        )}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Shared screen"
          className="h-full w-full object-contain"
        />
        {waiting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/50 p-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-2xl border bg-background text-muted-foreground">
              <ScreenShareIcon className="size-5" />
            </span>
            <div role="status">
              <p className="text-sm font-medium">
                {data.status === 'connecting'
                  ? 'Connecting to the shared screen…'
                  : data.status === 'failed'
                    ? 'Screen connection unavailable'
                    : `A seat at ${data.share?.user.username}’s screen`}
              </p>
              {data.status === 'idle' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Join in whenever you’re ready.
                </p>
              )}
            </div>
            {!data.local && !data.watching && (
              <Button size="sm" onClick={data.watch}>
                <PlayIcon fill="currentColor" className="size-3" />
                {data.status === 'failed' ? 'Retry connection' : 'Watch screen'}
              </Button>
            )}
          </div>
        )}
        {!waiting && needsResume && (
          <button
            type="button"
            aria-label="Resume screen"
            onClick={resume}
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/30 text-white outline-none transition-colors hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          >
            <span className="flex size-12 items-center justify-center rounded-full border border-white/20 bg-popover text-popover-foreground shadow-sm">
              <PlayIcon fill="currentColor" className="size-5" />
            </span>
            <span className="text-xs font-medium">Resume screen</span>
          </button>
        )}
      </div>
      {data.error && (
        <footer
          className="nodrag nopan shrink-0 rounded-2xl border bg-popover p-3 shadow-sm"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <p role="alert" className="text-sm text-destructive">
            {data.error}
          </p>
        </footer>
      )}
    </section>
  );
}
