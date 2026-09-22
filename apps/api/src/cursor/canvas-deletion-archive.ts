import type { Prisma } from '@app/db';
import type { CanvasCommandResult } from '@app/shared';
import type { CanvasNodeRecord } from './canvas-node-record.js';

type ArchivedResult = CanvasCommandResult & {
  deletion?: { userId: string; node: CanvasNodeRecord; restored?: boolean };
};

export async function readDeletionArchive(
  database: Prisma.TransactionClient,
  roomId: string,
  deletionId: string,
  userId: string,
) {
  const receipt = await database.canvasOperation.findUnique({
    where: { roomId_id: { roomId, id: deletionId } },
  });
  const archived: ArchivedResult | undefined = receipt
    ? JSON.parse(receipt.result)
    : undefined;
  return archived?.ok &&
    archived.deletion?.userId === userId &&
    !archived.deletion.restored
    ? archived
    : undefined;
}

export async function restoreDeletionArchive(
  database: Prisma.TransactionClient,
  roomId: string,
  deletionId: string,
  userId: string,
) {
  const archived = await readDeletionArchive(
    database,
    roomId,
    deletionId,
    userId,
  );
  if (!archived?.deletion)
    throw new Error('This deletion can no longer be undone.');
  const { messages, ...node } = archived.deletion.node;
  await database.canvasNode.create({
    data: {
      ...node,
      messages: {
        create: messages.map((message) => ({
          id: message.id,
          text: message.text,
          authorId: message.authorId,
          authorUsername: message.authorUsername,
          authorColor: message.authorColor,
          createdAt: message.createdAt,
        })),
      },
    },
  });
  archived.deletion.restored = true;
  await database.canvasOperation.update({
    where: { roomId_id: { roomId, id: deletionId } },
    data: { result: JSON.stringify(archived) },
  });
}
