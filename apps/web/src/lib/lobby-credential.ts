import { z } from '@app/shared';

const memory = new Map<string, string>();
const key = (roomId: string) => `manylatte:lobby-credential:${roomId}`;

export function saveLobbyCredential(roomId: string, token: string) {
  memory.set(roomId, token);
  try {
    localStorage.setItem(key(roomId), token);
  } catch {
    // Private browsing can disable storage; retain identity for this page.
  }
}

export function getLobbyCredential(roomId: string): string {
  try {
    const stored = z.uuidv4().safeParse(localStorage.getItem(key(roomId)));
    if (stored.success) return stored.data;
  } catch {
    // Use the page's credential if browser storage is unavailable.
  }
  const existing = memory.get(roomId);
  if (existing) return existing;
  const token = crypto.randomUUID();
  saveLobbyCredential(roomId, token);
  return token;
}
