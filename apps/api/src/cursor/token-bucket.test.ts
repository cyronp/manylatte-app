import { describe, expect, it } from 'vitest';

import { TokenBucket } from './token-bucket.js';

describe('TokenBucket', () => {
  it('allows a bounded burst and refills over time', () => {
    const limiter = new TokenBucket(2, 2, 0);

    expect(limiter.take(0)).toBe(true);
    expect(limiter.take(0)).toBe(true);
    expect(limiter.take(0)).toBe(false);
    expect(limiter.take(499)).toBe(false);
    expect(limiter.take(500)).toBe(true);
  });
});
