import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PosDevice, PosDeviceConfig } from '$lib/pos/device';
import type { OutboxOp, StoredOp } from './op';
import type { BarSnapshot, DeviceIdentity } from './types';

const DB_NAME = 'baroo-offline';
const DB_VERSION = 1;

interface BarooDB extends DBSchema {
    meta: {
        key: string;
        value: unknown;
    };
    snapshot: {
        key: string;
        value: BarSnapshot;
    };
    outbox: {
        key: number;
        value: OutboxOp;
        indexes: { 'by-bar': string; 'by-clientId': string };
    };
}

let dbPromise: Promise<IDBPDatabase<BarooDB>> | null = null;
export function db(): NonNullable<typeof dbPromise> {
    if (!dbPromise) {
        dbPromise = openDB<BarooDB>(DB_NAME, DB_VERSION, {
            upgrade(database) {
                database.createObjectStore('meta');
                database.createObjectStore('snapshot');
                const outbox = database.createObjectStore('outbox', {
                    autoIncrement: true,
                });
                outbox.createIndex('by-bar', 'barSlug');
                outbox.createIndex('by-clientId', 'clientId', { unique: true });
            },
        });
    }
    return dbPromise;
}

// --- meta -------------------------------------------------------------------

const DEVICE_KEY = 'device';
const LAST_SYNC_KEY = 'lastSyncAt';

export async function readDevice(): Promise<DeviceIdentity | null> {
    return ((await (await db()).get('meta', DEVICE_KEY)) as DeviceIdentity) ?? null;
}

export async function writeDevice(identity: DeviceIdentity): Promise<DeviceIdentity> {
    await (await db()).put('meta', identity, DEVICE_KEY);
    return identity
}

export async function clearDevice(): Promise<void> {
    await (await db()).delete('meta', DEVICE_KEY);
}

export async function refreshDeviceToken(token: string): Promise<void> {
    const identity = await readDevice();
    if (!identity || identity.token === token) return;
    await writeDevice({ ...identity, token });
}

export async function writeSpigotTicket(spigotTicket: string | null): Promise<void> {
    const identity = await readDevice();
    if (!identity || (identity.spigotTicket ?? null) === spigotTicket) return;

    const { spigotTicket: _stale, ...rest } = identity;
    await writeDevice(spigotTicket ? { ...rest, spigotTicket } : rest);
}

export async function patchDevice(device: Partial<PosDevice>): Promise<DeviceIdentity | null> {
    const identity = await readDevice();
    if (!identity) return null;
    return writeDevice({ ...identity, device: { ...identity.device, ...device } });
}

export async function readLastSyncAt(): Promise<string | null> {
    return ((await (await db()).get('meta', LAST_SYNC_KEY)) as string) ?? null;
}

export async function writeLastSyncAt(at: string): Promise<void> {
    await (await db()).put('meta', at, LAST_SYNC_KEY);
}

// --- snapshot ---------------------------------------------------------------

export async function readSnapshot(barSlug: string): Promise<BarSnapshot | null> {
    return (await (await db()).get('snapshot', barSlug)) ?? null;
}

export async function writeSnapshot(snapshot: BarSnapshot): Promise<void> {
    await (await db()).put('snapshot', snapshot, snapshot.bar.slug);
}

// --- outbox -----------------------------------------------------------------

export async function appendOp(op: OutboxOp): Promise<StoredOp> {
    const seq = await (await db()).add('outbox', op);
    return { ...op, seq: seq as number };
}

/** Pending ops for a bar, oldest first — the order they must be applied in. */
export async function listOps(barSlug: string): Promise<StoredOp[]> {
    const database = await db();
    const ops: StoredOp[] = [];

    let cursor = await database.transaction('outbox').store.openCursor();
    while (cursor) {
        if (cursor.value.barSlug === barSlug) {
            ops.push({ ...cursor.value, seq: cursor.key as number });
        }
        cursor = await cursor.continue();
    }

    return ops;
}

export async function deleteOp(seq: number): Promise<void> {
    await (await db()).delete('outbox', seq);
}

export async function deleteOpsByClientId(clientIds: string[]): Promise<void> {
    if (!clientIds.length) return;
    const database = await db();
    const tx = database.transaction('outbox', 'readwrite');
    const index = tx.store.index('by-clientId');

    for (const clientId of clientIds) {
        const key = await index.getKey(clientId);
        if (key !== undefined) await tx.store.delete(key);
    }

    await tx.done;
}

export async function markOpFailed(seq: number, error: string): Promise<void> {
    const database = await db();
    const tx = database.transaction('outbox', 'readwrite');
    const existing = await tx.store.get(seq);
    if (existing) {
        await tx.store.put({ ...existing, attempts: existing.attempts + 1, error }, seq);
    }
    await tx.done;
}
