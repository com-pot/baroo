import { DEVICE_ID_HEADER, type PosDeviceConfig } from '$lib/pos/device';
import {
    deleteOpsByClientId,
    listOps,
    markOpFailed,
    readDevice,
    refreshDeviceToken,
    writeDeviceConfig,
    writeLastSyncAt,
    writeSnapshot,
} from './idb';
import type { StoredOp } from './op';
import type { BarSnapshot, DeviceIdentity } from './types';

export type SyncOpResult = {
    clientId: string;
    status: 'applied' | 'duplicate' | 'failed';
    error?: string;
};

export type SyncResponse = {
    results: SyncOpResult[];
    token: string;
};

export class NotEnrolledError extends Error {
    constructor() {
        super('device-not-enrolled');
        this.name = 'NotEnrolledError';
    }
}

async function deviceHeaders(): Promise<{ identity: DeviceIdentity; headers: HeadersInit }> {
    const identity = await readDevice();
    if (!identity) throw new NotEnrolledError();

    return {
        identity,
        headers: {
            [DEVICE_ID_HEADER]: identity.deviceId,
            Authorization: `Bearer ${identity.token}`,
        },
    };
}

/** Downloads a fresh snapshot and stores it, replacing whatever was there. */
export async function pullSnapshot(barSlug?: string): Promise<BarSnapshot> {
    const { identity, headers } = await deviceHeaders();
    const slug = barSlug || identity.barSlug;

    const response = await fetch(`/api/bars/${slug}/snapshot`, { headers });
    if (!response.ok) {
        throw new Error(`snapshot failed: ${response.status} ${await response.text()}`);
    }

    const { snapshot, token, config } = (await response.json()) as {
        snapshot: BarSnapshot;
        token: string;
        config?: PosDeviceConfig;
    };

    await writeSnapshot(snapshot);
    await refreshDeviceToken(token);
    if (config) await writeDeviceConfig(config);

    return snapshot;
}

/**
 * Pushes every pending op for the bar, oldest first, and drops the ones the server
 * accepted (or already had). Ops that failed stay put with their error recorded — a
 * failed op must never be silently discarded, it's someone's drink.
 */
export async function pushOutbox(barSlug?: string): Promise<SyncOpResult[]> {
    const { identity, headers } = await deviceHeaders();
    const slug = barSlug || identity.barSlug;

    const ops = await listOps(slug);
    if (!ops.length) return [];

    const response = await fetch(`/api/bars/${slug}/sync`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: ops.map(stripSeq) }),
    });

    if (!response.ok) {
        throw new Error(`sync failed: ${response.status} ${await response.text()}`);
    }

    const { results, token } = (await response.json()) as SyncResponse;
    await refreshDeviceToken(token);

    const settled = results.filter(r => r.status !== 'failed').map(r => r.clientId);
    await deleteOpsByClientId(settled);

    const bySeq = new Map(ops.map(op => [op.clientId, op.seq]));
    for (const result of results) {
        if (result.status !== 'failed') continue;
        const seq = bySeq.get(result.clientId);
        if (seq !== undefined) await markOpFailed(seq, result.error || 'unknown');
    }

    await writeLastSyncAt(new Date().toISOString());

    return results;
}

/** Push first, then pull — so the refreshed snapshot already contains what we just sent. */
export async function syncAll(barSlug?: string) {
    const results = await pushOutbox(barSlug);
    const snapshot = await pullSnapshot(barSlug);
    return { results, snapshot };
}

function stripSeq(op: StoredOp): Omit<StoredOp, "seq"> {
    const { seq: _seq, ...rest } = op;
    return rest;
}
