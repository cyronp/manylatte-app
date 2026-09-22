import type {
  CanvasNode,
  CanvasNodeMutation,
  CanvasPostitColor,
} from '@app/shared';
import type { Node, NodeProps } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/socket-provider';

import {
  PostitActions,
  POSTIT_COLORS,
  POSTIT_COLOR_NAMES,
} from './postit-actions';

export type PostitNode = Node<
  Extract<CanvasNode, { type: 'postit' }>['data'] & {
    draft?: { position: { x: number; y: number }; onCancel: () => void };
  },
  'postit'
>;

export const PostitCanvasNode = ({ id, data }: NodeProps<PostitNode>) => {
  const [draftColor, setDraftColor] = useState<CanvasPostitColor>();
  const [menuOpen, setMenuOpen] = useState(false);
  // Existing notes retain their original color until a color is chosen.
  const color =
    (data.draft ? draftColor : undefined) ??
    data.color ??
    POSTIT_COLOR_NAMES[(Number.parseInt(id.slice(-1), 16) || 0) % 4] ??
    'yellow';
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
                data: { text, ...(draftColor ? { color: draftColor } : {}) },
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
  }, [data, draftColor, execute, id, isOwner, status, text]);

  const applyAction = async (mutation: CanvasNodeMutation) => {
    if (pending.current || !isOwner || status !== 'connected') return;
    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const result = await execute({ type: 'mutation', mutation });
      if (!result.ok) setError(result.message);
    } catch {
      setError('Could not update your Post-it. Please try again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if ((!editing && !menuOpen) || !isOwner) return;
    const outside = (event: Event) => {
      if (
        event.target instanceof window.Node &&
        !section.current?.contains(event.target)
      ) {
        setMenuOpen(false);
        if (editing) void finish();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
    };
  }, [editing, finish, isOwner, menuOpen]);

  return (
    <section
      ref={section}
      aria-label={`Post-it by ${data.user.username}`}
      title={
        isOwner && !editing
          ? 'Click for actions. Drag to move. Double-click or press Enter to edit.'
          : undefined
      }
      tabIndex={isOwner ? 0 : undefined}
      onClick={() => {
        if (isOwner) setMenuOpen(true);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isOwner) setMenuOpen(true);
      }}
      onDoubleClick={() => {
        if (isOwner) setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menuOpen) {
          event.stopPropagation();
          setMenuOpen(false);
          section.current?.focus();
          return;
        }
        if (
          isOwner &&
          event.key === ' ' &&
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(true);
        }
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
      className={`relative flex size-64 cursor-grab flex-col rounded-none ${POSTIT_COLORS[color]} text-black shadow-md active:cursor-grabbing`}
    >
      {isOwner && menuOpen && (
        <PostitActions
          color={color}
          disabled={saving || (!data.draft && status !== 'connected')}
          onColorChange={(nextColor) => {
            if (data.draft) setDraftColor(nextColor);
            else
              void applyAction({
                action: 'update-postit',
                nodeId: id,
                color: nextColor,
              });
          }}
          onRemove={() => {
            if (data.draft) data.draft.onCancel();
            else void applyAction({ action: 'delete', nodeId: id });
          }}
        />
      )}
      {isOwner && editing ? (
        <div
          className="nodrag nopan nowheel min-h-0 flex-1 overflow-y-auto cursor-auto p-4"
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
          <div className="relative min-h-40 whitespace-pre-wrap wrap-break-words text-sm leading-relaxed">
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
        </div>
      ) : (
        <p className="nowheel min-h-0 flex-1 overflow-y-auto select-none whitespace-pre-wrap wrap-break-words p-4 text-sm leading-relaxed">
          {text ||
            (isOwner ? 'Double-click to write a note…' : 'Empty Post-it')}
        </p>
      )}
      <footer className="shrink-0 wrap-break-words px-4 pb-3 text-xs text-black/60">
        {saving && (
          <p role="status" className="mb-2">
            Saving…
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 text-black">
            {error}
          </p>
        )}
        {data.user.username}
      </footer>
    </section>
  );
};
