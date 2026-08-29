import type { Node, NodeProps } from '@xyflow/react';

export type EmojiNode = Node<
  {
    emoji: string;
    label: string;
  },
  'emoji'
>;

export const EmojiCanvasNode = ({ data }: NodeProps<EmojiNode>) => (
  <div
    aria-label={data.label}
    className="rounded-lg p-1 text-5xl leading-none select-none"
    role="img"
    title={data.label}
  >
    <span aria-hidden="true">{data.emoji}</span>
  </div>
);
