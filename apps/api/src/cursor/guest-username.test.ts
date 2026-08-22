import { describe, expect, it } from 'vitest';

import {
  COFFEE_GUEST_NAMES,
  createCoffeeGuestUsername,
} from './guest-username.js';

describe('coffee guest username', () => {
  it('combines a coffee name with a zero-padded four-digit number', () => {
    const values = [0.5, 0.0042];

    expect(createCoffeeGuestUsername(() => values.shift() ?? 0)).toBe(
      'Espresso-0042',
    );
  });

  it('keeps generated values inside the expected ranges', () => {
    expect(createCoffeeGuestUsername(() => 0)).toBe(
      `${COFFEE_GUEST_NAMES[0]}-0000`,
    );
    expect(createCoffeeGuestUsername(() => 0.999999)).toBe(
      `${COFFEE_GUEST_NAMES.at(-1)}-9999`,
    );
  });
});
