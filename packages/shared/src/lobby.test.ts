import { describe, expect, it } from 'vitest';
import { lobbyCodeSchema } from './lobby.js';

describe('lobby codes', () => {
  it.each(['AB12-CD34', 'ab12-cd34', 'ab12cd34', ' AB12-CD34 '])(
    'normalizes %s',
    (code) => {
      expect(lobbyCodeSchema.parse(code)).toBe('AB12-CD34');
    },
  );
  it.each([
    '',
    'lobby',
    'AB12',
    'AB12-CD345',
    'AB1-CD345',
    'AB12_CD34',
    'AB12-CD3!',
    'ＡB12-CD34',
  ])('rejects %s', (code) => {
    expect(lobbyCodeSchema.safeParse(code).success).toBe(false);
  });
});
