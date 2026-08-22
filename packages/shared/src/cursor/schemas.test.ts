import { describe, expect, it } from 'vitest';

import {
  cursorInputSchema,
  cursorRoomIdSchema,
  cursorSocketAuthSchema,
  cursorUsernameSchema,
} from './schemas.js';

describe('cursor contract', () => {
  it('accepts normalized cursor input with a sequence', () => {
    expect(cursorInputSchema.parse({ sequence: 3, x: 0.25, y: 0.75 })).toEqual({
      sequence: 3,
      x: 0.25,
      y: 0.75,
    });
  });

  it('rejects coordinates outside the shared surface', () => {
    expect(
      cursorInputSchema.safeParse({ sequence: 0, x: 1.01, y: 0.5 }).success,
    ).toBe(false);
    expect(
      cursorInputSchema.safeParse({ sequence: 0, x: 0.5, y: -0.01 }).success,
    ).toBe(false);
  });

  it('keeps room identifiers URL and adapter friendly', () => {
    expect(cursorRoomIdSchema.safeParse('team_board-42').success).toBe(true);
    expect(cursorRoomIdSchema.safeParse('team/board').success).toBe(false);
    expect(
      cursorSocketAuthSchema.safeParse({ roomId: '', username: 'Alex' })
        .success,
    ).toBe(false);
    expect(
      cursorSocketAuthSchema.safeParse({ roomId: 'lobby', username: 'Alex' })
        .success,
    ).toBe(true);
    expect(cursorUsernameSchema.safeParse('   ').success).toBe(false);
  });
});
