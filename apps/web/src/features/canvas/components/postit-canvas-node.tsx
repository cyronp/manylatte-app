import type { CanvasNode } from '@app/shared';
import type { Node, NodeProps } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/socket-provider';

const POSTIT_COLORS = [
  'bg-yellow-200',
  'bg-pink-200',
  'bg-blue-200',
  'bg-green-200',
] as const;

export type PostitNode = Node<
  Extract<CanvasNode, { type: 'postit' }>['data'] & {
    draft?: { position: { x: number; y: number }; onCancel: () => void };
  },
  'postit'
>;

export const PostitCanvasNode = ({ id, data }: NodeProps<PostitNode>) => {
  // The random UUID keeps each note's color consistent across viewers and reloads.
  const color = POSTIT_COLORS[(Number.parseInt(id.slice(-1), 16) || 0) % 4];
  const { execute, status, user } = useSocket();
  const [draft, setDraft] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(Boolean(data.draft));
  const section = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const isOwner = user?.userId === data.user.userId;
  const text = draft ?? data.text;

  const finish = useCallback(async () => {
    if (pending.current || !isOwner) return;
    if (!text.trim()) {
      if (data.draft) data.draft.onCancel();
      else {
        setDraft(undefined);
        setEditing(false);
      }
      return;
    }
    if (!data.draft && text === data.text) {
      setEditing(false);
      return;
    }
    if (status !== 'connected') {
      setError('Reconnect, then click outside to save.');
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const result = await execute({
        type: 'mutation',
        mutation: data.draft
          ? {
              action: 'create',
              node: {
                id,
                type: 'postit',
                position: data.draft.position,
                data: { text },
              },
            }
          : { action: 'update-postit', nodeId: id, text },
      });
      if (result.ok) {
        setDraft(undefined);
        setEditing(false);
      } else setError(result.message);
    } catch {
      setError('Could not save your Post-it. Click outside to try again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [data, execute, id, isOwner, status, text]);

  useEffect(() => {
    if (!editing || !isOwner) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof window.Node &&
        !section.current?.contains(event.target)
      )
        void finish();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
    };
  }, [editing, finish, isOwner]);

  return (
    <section
      ref={section}
      aria-label={`Post-it by ${data.user.username}`}
      title={
        isOwner && !editing
          ? 'Drag to move. Double-click or press Enter to edit.'
          : undefined
      }
      tabIndex={isOwner ? 0 : undefined}
      onDoubleClick={() => {
        if (isOwner) setEditing(true);
      }}
      onKeyDown={(event) => {
        if (
          isOwner &&
          event.key === 'Enter' &&
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }
      }}
      className={`w-64 cursor-grab rounded-none ${color} text-black shadow-md active:cursor-grabbing`}
    >
      {isOwner && editing ? (
        <div
          className="nodrag nopan cursor-auto p-4"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' && !pending.current) {
              if (data.draft) data.draft.onCancel();
              else {
                setDraft(undefined);
                setEditing(false);
              }
            }
          }}
        >
          <div className="relative min-h-40 whitespace-pre-wrap break-words text-sm leading-relaxed">
            <div aria-hidden="true" className="invisible min-h-40">
              {text + ' '}
            </div>
            <textarea
              aria-label="Post-it text"
              autoFocus
              className="absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent p-0 text-sm leading-relaxed outline-none placeholder:text-black"
              maxLength={1000}
              placeholder="Write a note…"
              value={text}
              readOnly={saving}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          {saving && (
            <p role="status" className="mt-2 text-xs">
              Saving…
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="min-h-48 select-none whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
          {text ||
            (isOwner ? 'Double-click to write a note…' : 'Empty Post-it')}
        </p>
      )}
      <footer className="break-words px-4 pb-3 text-xs text-black/60">
        {data.user.username}
      </footer>
    </section>
  );
};
