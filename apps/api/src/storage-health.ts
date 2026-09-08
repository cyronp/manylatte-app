import { stat, statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveDatabaseUrl, type Database } from '@app/db';

export function createStorageHealth(database: Database, databaseUrl?: string) {
  const path = resolveDatabaseUrl(databaseUrl).slice('file:'.length);
  let ready = false;
  let sizeBytes: number | undefined;
  let freeBytes: number | undefined;
  let checking: Promise<void> | undefined;
  const check = () =>
    (checking ??= (async () => {
      try {
        // Exercise a real write, so a readable but unwritable/full database is not ready.
        await database.$executeRawUnsafe(
          'UPDATE _StorageProbe SET value = 1 - value WHERE id = 1',
        );
        if (path !== ':memory:') {
          const [file, filesystem] = await Promise.all([
            stat(path),
            statfs(dirname(path)),
          ]);
          sizeBytes = file.size;
          freeBytes = filesystem.bavail * filesystem.bsize;
        }
        ready = true;
      } catch {
        ready = false;
      } finally {
        checking = undefined;
      }
    })());
  return {
    check,
    snapshot: () => ({
      storageReady: ready,
      databaseBytes: sizeBytes,
      freeBytes,
    }),
  };
}
