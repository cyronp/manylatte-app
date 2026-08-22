import type { CursorUsername } from '@app/shared';

export const COFFEE_GUEST_NAMES = [
  'Affogato',
  'Americano',
  'Cappuccino',
  'Cortado',
  'Espresso',
  'Latte',
  'Macchiato',
  'Mocha',
] as const;

export const createCoffeeGuestUsername = (
  random: () => number = Math.random,
): CursorUsername => {
  const coffee =
    COFFEE_GUEST_NAMES[Math.floor(random() * COFFEE_GUEST_NAMES.length)] ??
    COFFEE_GUEST_NAMES[0];
  const suffix = Math.floor(random() * 10_000)
    .toString()
    .padStart(4, '0');

  return `${coffee}-${suffix}`;
};
