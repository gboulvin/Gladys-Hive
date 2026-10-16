// -----------------------------------------------------------------------------
// Session store: the little the Hive login must keep across restarts (the
// remembered device, the refresh token, a pending SMS challenge).
//
// The container rootfs is read-only: /data is the only writable volume.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'hive-store' });

export const DEFAULT_SESSION_FILE = process.env.HIVE_SESSION_FILE ?? '/data/hive-session.json';

/** JSON file store, written atomically and readable by its owner only. */
export function createFileStore(path = DEFAULT_SESSION_FILE) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Ignoring an unreadable session file (${err.message})`);
        }
        return {};
      }
    },
    async save(state) {
      try {
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
        await rename(tmp, path);
      } catch (err) {
        // Without /data the integration still works, it just asks for an SMS
        // code again after a restart.
        logger.warn(`Could not save the Hive session (${err.message})`);
      }
    },
  };
}

/** In-memory store, for the tests. */
export function createMemoryStore(initial = {}) {
  let state = structuredClone(initial);
  return {
    async load() {
      return structuredClone(state);
    },
    async save(next) {
      state = structuredClone(next);
    },
    get state() {
      return state;
    },
  };
}
