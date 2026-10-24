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
    results: SyncResults;
    token: string;
};
export type SyncResults = {
    [key in SyncOpResult["status"]]: SyncOpResult[]
}

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
            [DEVICE_ID_HEADER]: identity.device.id,
            Authorization: `Bearer ${identity.token}`,
        },
    };
}

export async function pullSnapshot(barSlug?: string): Promise<BarSnapshot> {
    const { identity, headers } = await deviceHeaders();
    const slug = barSlug || identity.bar.slug;

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

    // Settings edited at the tablet outrank the server's copy until the op carrying them
    // has been accepted. Without this the pull that follows a save hands the barman back
    // the very setting they just changed — and a pull can happen with no push before it,
    // or after a push the server refused.
    const unpushedEdit = (await listOps(slug)).some(op => op.kind === 'device-config');
    if (config && !unpushedEdit) await writeDeviceConfig(config);

    return snapshot;
}

/**
 * Pushes chronologically pending ops for the bar and drops the ok ones.
 * Failed ops stay with their error recorded
 */
export async function pushOutbox(barSlug?: string): Promise<SyncResults|null> {
    const { identity, headers } = await deviceHeaders();
    const slug = barSlug || identity.bar.slug;

    const ops = await listOps(slug);
    if (!ops.length) return null;

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

    const settled = [...results.applied, ...results.duplicate].map(r => r.clientId);
    await deleteOpsByClientId(settled);

    const bySeq = new Map(ops.map(op => [op.clientId, op.seq]));
    for (const result of results.failed) {
        const seq = bySeq.get(result.clientId);
        if (seq !== undefined) await markOpFailed(seq, result.error || 'unknown');
    }

    await writeLastSyncAt(new Date().toISOString());

    return results;
}

function stripSeq(op: StoredOp): Omit<StoredOp, "seq"> {
    const { seq: _seq, ...rest } = op;
    return rest;
}
