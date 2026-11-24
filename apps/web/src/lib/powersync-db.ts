import { PowerSyncDatabase } from '@powersync/web';
import { PowerSyncConnector } from './powersync-connector';
import { AppSchema } from './powersync-schema';

export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'numera-rush.sqlite' },
});

let connection: Promise<void> | null = null;

/**
 * Connect once on startup. A failure (missing PowerSync/Supabase credentials)
 * must not break gameplay: the UI degrades to an empty local replica.
 */
function hasUsablePowerSyncUrl(value: string | undefined): boolean {
  if (!value || value.includes('<')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function initPowerSync(): Promise<void> {
  const endpoint = import.meta.env.VITE_POWERSYNC_URL as string | undefined;
  if (!hasUsablePowerSyncUrl(endpoint)) {
    console.warn(
      '[powersync] No usable VITE_POWERSYNC_URL — live panels stay empty instead of retrying.',
    );
    return Promise.resolve();
  }

  connection ??= (async () => {
    try {
      await powerSyncDb.connect(new PowerSyncConnector());
    } catch (error) {
      console.error('[powersync] failed to connect; live panels stay empty', error);
    }
  })();
  return connection;
}
