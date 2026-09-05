import type { Database } from '@app/db';
import {
  canvasNodeSchema,
  type CanvasMessage,
  type CanvasNode,
  type CanvasNodeMutation,
  type CursorUser,
} from '@app/shared';

export interface CanvasPersistence {
  load: (roomId: string) => Promise<CanvasNode[]>;
  mutate: (
    roomId: string,
    mutation: CanvasNodeMutation,
    user?: CursorUser,
  ) => Promise<void>;
  appendMessage: (
    roomId: string,
    nodeId: string,
    message: CanvasMessage,
  ) => Promise<void>;
}

export const createCanvasPersistence = (
  database: Database,
): CanvasPersistence => ({
  async load(roomId) {
    const nodes = await database.canvasNode.findMany({
      where: { roomId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { messages: { orderBy: { sequence: 'asc' } } },
    });
    return nodes.map((node) =>
      canvasNodeSchema.parse({
        id: node.id,
        type: node.type,
        position: { x: node.x, y: node.y },
        data:
          node.type === 'emoji'
            ? {
                emoji: node.emoji,
                label: node.label,
                ...(node.authorId && node.authorUsername && node.authorColor
                  ? {
                      user: {
                        userId: node.authorId,
                        username: node.authorUsername,
                        color: node.authorColor,
                      },
                    }
                  : {}),
              }
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
              },
      }),
    );
  },
  async mutate(roomId, mutation, user) {
    if (mutation.action === 'delete') {
      await database.canvasNode.deleteMany({
        where: { id: mutation.nodeId, roomId },
      });
      return;
    }
    if (mutation.action === 'move') {
      await database.canvasNode.update({
        where: { id: mutation.nodeId, roomId },
        data: { x: mutation.position.x, y: mutation.position.y },
      });
      return;
    }
    const { node } = mutation;
    await database.canvasNode.create({
      data: {
        id: node.id,
        roomId,
        type: node.type,
        x: node.position.x,
        y: node.position.y,
        ...(node.type === 'emoji'
          ? {
              emoji: node.data.emoji,
              label: node.data.label,
              authorId: user?.userId,
              authorUsername: user?.username,
              authorColor: user?.color,
            }
          : {}),
      },
    });
  },
  async appendMessage(roomId, nodeId, message) {
    await database.canvasMessage.create({
      data: {
        id: message.id,
        text: message.text,
        authorId: message.author.userId,
        authorUsername: message.author.username,
        authorColor: message.author.color,
        node: { connect: { id: nodeId, roomId } },
      },
    });
  },
});
