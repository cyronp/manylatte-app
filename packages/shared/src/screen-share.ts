import { z } from 'zod';
import { canvasPositionSchema } from './canvas/schemas.js';
import type { CursorUser } from './cursor/schemas.js';

export const MAX_SCREEN_SHARE_VIEWERS = 8;
export const screenShareIdSchema = z.strictObject({ shareId: z.uuidv4() });
export const screenShareStartSchema = z.strictObject({
  shareId: z.uuidv4(),
  position: canvasPositionSchema,
});
export const screenShareWatchSchema = screenShareIdSchema.extend({
  connectionId: z.uuidv4(),
});
export const screenShareSignalSchema = screenShareWatchSchema.extend({
  peerId: z.string().min(1).max(128),
  signal: z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('offer'),
      sdp: z.string().min(1).max(16_384),
    }),
    z.strictObject({
      type: z.literal('answer'),
      sdp: z.string().min(1).max(16_384),
    }),
    z.strictObject({
      type: z.literal('candidate'),
      candidate: z.strictObject({
        candidate: z.string().max(2_048),
        sdpMid: z.string().max(256).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      }),
    }),
  ]),
});

export type ScreenShareStart = z.infer<typeof screenShareStartSchema>;
export type ScreenShareWatch = z.infer<typeof screenShareWatchSchema>;
export type ScreenShareSignal = z.infer<typeof screenShareSignalSchema>;
export interface ScreenShare {
  id: string;
  presenterId: string;
  user: CursorUser;
  position: { x: number; y: number };
  viewerCount: number;
}
export interface ScreenShareIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}
export type ScreenShareResult =
  | { ok: true; iceServers: ScreenShareIceServer[] }
  | { ok: false; message: string };
export interface ScreenShareSync {
  share: ScreenShare | null;
  iceServers: ScreenShareIceServer[];
}
export interface ScreenShareViewer extends ScreenShareWatch {
  peerId: string;
  joined: boolean;
}
