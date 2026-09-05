import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_DATABASE_URL = 'file:./prisma/manylatte.db';

// src/ and dist/ are siblings: CLI, dev, and production resolve the same file.
export const resolveDatabaseUrl = (value = DEFAULT_DATABASE_URL) => {
  if (!value.startsWith('file:') || value.slice(5).trim().length === 0) {
    throw new Error('DATABASE_URL must be a SQLite file: path');
  }
  const filename = value.slice(5);
  if (filename === ':memory:') return 'file::memory:';
  if (filename.includes('?') || filename.includes('#')) {
    throw new Error(
      'DATABASE_URL must be a SQLite file path without query or fragment',
    );
  }
  return `file:${isAbsolute(filename) ? filename : resolve(packageDirectory, filename)}`;
};
