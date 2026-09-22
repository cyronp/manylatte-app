import type { Prisma } from '@app/db';
import { canvasNodeSchema } from '@app/shared';

export type CanvasNodeRecord = Prisma.CanvasNodeGetPayload<{
  include: { messages: true };
}>;

// Callers supply messages in chronological order, including full archives.
export function toCanvasNode(node: CanvasNodeRecord) {
  const user =
    node.authorId && node.authorUsername && node.authorColor
      ? {
          userId: node.authorId,
          username: node.authorUsername,
          color: node.authorColor,
        }
      : undefined;
  return canvasNodeSchema.parse({
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    data:
      node.type === 'postit'
        ? {
            text: node.postitText ?? '',
            ...(node.postitColor ? { color: node.postitColor } : {}),
            user,
          }
        : node.type === 'emoji'
          ? { emoji: node.emoji, label: node.label, ...(user ? { user } : {}) }
          : {
              messages: node.messages.map((message) => ({
                id: message.id,
                text: message.text,
                author: {
                  userId: message.authorId,
                  username: message.authorUsername,
                  color: message.authorColor,
                },
              })),
              messageCount: node.messageCount,
              textBytes: node.textBytes,
            },
  });
}
