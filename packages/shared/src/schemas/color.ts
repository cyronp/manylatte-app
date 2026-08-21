import { z } from 'zod';

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .brand<'HexColor'>();

export type HexColor = z.infer<typeof hexColorSchema>;
