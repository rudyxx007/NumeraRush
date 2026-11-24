import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web';
import { ensureAnonSession } from './supabase';

/**
 * PowerSync client auth uses the short-lived Supabase anonymous JWT.
 * Clients never upload: they are strictly read-only replicas.
 */
export class PowerSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const endpoint = import.meta.env.VITE_POWERSYNC_URL as string | undefined;
    if (!endpoint) {
      throw new Error('VITE_POWERSYNC_URL is not configured');
    }

    const session = await ensureAnonSession();
    if (!session) {
      throw new Error('No Supabase session available for PowerSync authentication');
    }

    return { endpoint, token: session.access_token };
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    console.warn('[powersync] Clients are read-only — discarding local write transaction');
    await transaction.complete();
  }
}
