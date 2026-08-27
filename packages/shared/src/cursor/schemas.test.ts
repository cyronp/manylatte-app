import { describe, expect, it } from 'vitest';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../canvas/constants.js';
import {
  cursorInputSchema,
  cursorRoomIdSchema,
  cursorSocketAuthSchema,
  cursorUsernameSchema,
} from './schemas.js';

describe('cursor contract', () => {
  it('accepts canvas world coordinates with a sequence', () => {
    expect(
      cursorInputSchema.parse({ sequence: 3, x: 2_400, y: 1_350 }),
    ).toEqual({
      sequence: 3,
      x: 2_400,
      y: 1_350,
    });
  });

  it('rejects coordinates outside the shared surface', () => {
    expect(
      cursorInputSchema.safeParse({
        sequence: 0,
        x: CANVAS_WIDTH + 1,
        y: 0,
      }).success,
    ).toBe(false);
    expect(
      cursorInputSchema.safeParse({ sequence: 0, x: 0, y: -1 }).success,
    ).toBe(false);
    expect(
      cursorInputSchema.safeParse({
        sequence: 0,
        x: CANVAS_WIDTH,
        y: CANVAS_HEIGHT,
      }).success,
    ).toBe(true);
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
    expect(cursorSocketAuthSchema.safeParse({ roomId: 'lobby' }).success).toBe(
      true,
    );
    expect(cursorUsernameSchema.safeParse('   ').success).toBe(false);
    expect(cursorUsernameSchema.safeParse('x'.repeat(33)).success).toBe(false);
    expect(cursorUsernameSchema.parse('  Alex  ')).toBe('Alex');
  });

  it('normalizes usernames and rejects control or directional characters', () => {
    expect(cursorUsernameSchema.parse('Cafe\u0301')).toBe('Caf\u00e9');
    expect(cursorUsernameSchema.safeParse('Alex\nAdmin').success).toBe(false);
    expect(cursorUsernameSchema.safeParse('Alex\u202eAdmin').success).toBe(
      false,
    );
    expect(cursorUsernameSchema.safeParse('Alex\u200bAdmin').success).toBe(
      false,
    );
  });
});
