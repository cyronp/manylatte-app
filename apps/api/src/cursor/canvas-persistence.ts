import type { Database, Prisma } from '@app/db';
import {
  CANVAS_HISTORY_PAGE_SIZE,
  CANVAS_PREVIEW_MESSAGES,
  canvasCommandResultSchema,
  canvasNodeSchema,
  canvasMessageSchema,
  type CanvasCommand,
  type CanvasCommandResult,
  type CanvasHistoryInput,
  type CanvasHistoryPage,
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
    user: CursorUser,
  ) => Promise<void>;
  appendMessage: (
    roomId: string,
    nodeId: string,
    message: CanvasMessage,
  ) => Promise<void>;
  hasMessage: (roomId: string, nodeId: string, id: string) => Promise<boolean>;
  history: (
    roomId: string,
    input: CanvasHistoryInput,
  ) => Promise<CanvasHistoryPage>;
  receipt: (
    roomId: string,
    operationId: string,
  ) => Promise<{ hash: string; result: CanvasCommandResult } | undefined>;
  commit: (
    roomId: string,
    command: CanvasCommand,
    hash: string,
    user: CursorUser,
    result: CanvasCommandResult,
  ) => Promise<void>;
}

const toMessage = (message: {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorColor: string;
}): CanvasMessage =>
  canvasMessageSchema.parse({
    id: message.id,
    text: message.text,
    author: {
      userId: message.authorId,
      username: message.authorUsername,
      color: message.authorColor,
    },
  });

async function mutate(
  database: Prisma.TransactionClient,
  roomId: string,
  mutation: CanvasNodeMutation,
  user: CursorUser,
) {
  if (mutation.action === 'delete') {
    await database.canvasNode.deleteMany({
      where: { id: mutation.nodeId, roomId },
    });
  } else if (mutation.action === 'move') {
    await database.canvasNode.update({
      where: { id: mutation.nodeId, roomId },
      data: { x: mutation.position.x, y: mutation.position.y },
    });
  } else if (mutation.action === 'update-reaction') {
    await database.canvasNode.update({
      where: { id: mutation.nodeId, roomId, type: 'emoji' },
      data: { emoji: mutation.data.emoji, label: mutation.data.label },
    });
  } else {
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
              authorId: user.userId,
              authorUsername: user.username,
              authorColor: user.color,
            }
          : {}),
      },
    });
  }
}

async function append(
  database: Prisma.TransactionClient,
  roomId: string,
  nodeId: string,
  message: CanvasMessage,
) {
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
  await database.canvasNode.update({
    where: { id: nodeId, roomId },
    data: {
      messageCount: { increment: 1 },
      textBytes: { increment: Buffer.byteLength(message.text) },
    },
  });
}

export const createCanvasPersistence = (
  database: Database,
): CanvasPersistence => ({
  async load(roomId) {
    const nodes = await database.canvasNode.findMany({
      where: { roomId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        messages: {
          orderBy: { sequence: 'desc' },
          take: CANVAS_PREVIEW_MESSAGES,
        },
      },
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
                messages: node.messages.reverse().map(toMessage),
                messageCount: node.messageCount,
                textBytes: node.textBytes,
              },
      }),
    );
  },
  mutate: (roomId, mutation, user) =>
    database.$transaction((tx) => mutate(tx, roomId, mutation, user)),
  appendMessage: (roomId, nodeId, message) =>
    database.$transaction((tx) => append(tx, roomId, nodeId, message)),
  async hasMessage(roomId, nodeId, id) {
    return (
      (await database.canvasMessage.count({
        where: { id, nodeId, node: { roomId } },
      })) > 0
    );
  },
  async history(roomId, input) {
    const node = await database.canvasNode.findUnique({
      where: { id: input.nodeId, roomId, type: 'message' },
      select: { id: true },
    });
    if (!node) throw new Error('This conversation no longer exists.');
    const before = input.before
      ? await database.canvasMessage.findUnique({
          where: { id: input.before, nodeId: input.nodeId },
          select: { sequence: true },
        })
      : undefined;
    if (input.before && !before)
      throw new Error('This history page is no longer available.');
    const rows = await database.canvasMessage.findMany({
      where: {
        nodeId: input.nodeId,
        ...(before ? { sequence: { lt: before.sequence } } : {}),
      },
      orderBy: { sequence: 'desc' },
      take: CANVAS_HISTORY_PAGE_SIZE + 1,
    });
    return {
      messages: rows
        .slice(0, CANVAS_HISTORY_PAGE_SIZE)
        .reverse()
        .map(toMessage),
      hasMore: rows.length > CANVAS_HISTORY_PAGE_SIZE,
    };
  },
  async receipt(roomId, operationId) {
    const receipt = await database.canvasOperation.findUnique({
      where: { roomId_id: { roomId, id: operationId } },
    });
    return receipt
      ? {
          hash: receipt.hash,
          result: canvasCommandResultSchema.parse(JSON.parse(receipt.result)),
        }
      : undefined;
  },
  async commit(roomId, command, hash, user, result) {
    await database.$transaction(async (tx) => {
      const body = command.body;
      if (!result.ok || !result.change) {
        /* Persist only the receipt for an already-applied message. */
      } else if (body.type === 'mutation')
        await mutate(tx, roomId, body.mutation, user);
      else if (body.type === 'message')
        await append(tx, roomId, body.input.nodeId, {
          ...body.input,
          author: user,
        });
      else {
        await mutate(
          tx,
          roomId,
          {
            action: 'create',
            node: { id: body.nodeId, position: body.position, type: 'message' },
          },
          user,
        );
        await append(tx, roomId, body.nodeId, {
          ...body.message,
          author: user,
        });
      }
      await tx.lobby.update({
        where: { id: roomId },
        data: { lastActivityAt: new Date() },
      });
      await tx.canvasOperation.create({
        data: { roomId, id: command.id, hash, result: JSON.stringify(result) },
      });
    });
  },
});
