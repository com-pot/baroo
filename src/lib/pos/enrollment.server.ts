import { env } from '$env/dynamic/private';
import { randomInt } from 'node:crypto';
import { ClientResponseError } from 'pocketbase';
import { createAnonymousDb, type Db } from '$lib/db.server';
import type { DeviceIdentity } from '$lib/offline/types';
import { readPosConfig } from './device';
import { type PosEnrollmentCode } from './enrollmentCode';
import { toIsoDate } from '$lib/pocketbase';


export const EnrollmentCodesCollection = 'pos_enrollment_codes';
export const ENROLLMENT_CODE_TTL_MS = 60 * 60 * 1000;

export async function issueEnrollmentCode(
    ctx: Pick<App.Locals, "pb" | "logger">,
    deviceId: string,
): Promise<{ code: string; expiresAt: string }> {
    await revokeEnrollmentCode(ctx, deviceId);

    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const record = await ctx.pb.collection<PosEnrollmentCode>(EnrollmentCodesCollection)
                .create({
                    code: generateCode(),
                    device: deviceId,
                    expiresAt: new Date(Date.now() + ENROLLMENT_CODE_TTL_MS).toISOString(),
                });

            return { code: record.code, expiresAt: toIsoDate(record.expiresAt) };
        } catch (err) {
            if (!isRejectedWrite(err)) throw err;
        }
    }

    throw new Error('could not find a free enrollment code');
}

export async function revokeEnrollmentCode(ctx: Pick<App.Locals, "pb" | "logger">, deviceId: string): Promise<void> {
    const existing = await ctx.pb.collection<PosEnrollmentCode>(EnrollmentCodesCollection).getFullList({
        filter: ctx.pb.filter('device = {:device}', { device: deviceId }),
    });
    ctx.logger.info({
        msg: "revoking-enrollemnts",
        deviceId,
        toRevoke: existing.length,
    })

    for (const code of existing) {
        await ctx.pb.collection(EnrollmentCodesCollection).delete(code.id);
    }
}

export async function claimEnrollmentCode(code: string): Promise<DeviceIdentity> {
    const claimed = await createAnonymousDb(env).send<DeviceIdentity>('/api/baroo/device/enroll', {
        method: 'POST',
        body: { code },
    })

    return {
        ...claimed,
        device: { ...claimed.device, config: readPosConfig(claimed.device.config) },
    };
}

export async function listEnrollmentCodes(
    pb: Db,
    barSlug: string,
) {
    return pb.collection<PosEnrollmentCode>(EnrollmentCodesCollection).getFullList({
        filter: pb.filter('device.bar.slug = {:slug}', { slug: barSlug }),
    });
}

function isRejectedWrite(err: unknown): boolean {
    if (!(err instanceof ClientResponseError) || err.status !== 400) return false;

    const fields = (err.data?.data ?? {}) as Record<string, unknown>;
    const names = Object.keys(fields);

    return names.length === 0 || names.includes('code');
}

function generateCode(): string {
    return randomInt(0, 10_000).toString().padStart(4, '0');
}
