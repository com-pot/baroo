import { fail } from '@sveltejs/kit';
import { ensureUser } from '$lib/acl.server';
import { superuserStatus, superuserTokenExpiresAt } from '$lib/db.server';
import type { Bar } from '$lib/bar/BarModel';
import { issueEnrollmentCode, listEnrollmentCodes } from '$lib/pos/enrollment.server';
import { enrollmentCodeState } from '$lib/pos/enrollmentCode';
import { posConfigFromForm, readPosConfig, type PosDevice, type PosDeviceKind } from '$lib/pos/device';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const devices = await locals.pb.collection<PosDevice>('pos_devices')
        .getFullList({
            filter: locals.pb.filter('bar.slug = {:slug}', { slug: params.ref }),
            sort: '-created',
            expand: 'enrolledBy',
        });

    const codes = await listEnrollmentCodes(locals.pb, params.ref);

    // Config is normalised here so the form never has to reason about a missing field,
    // and a code is resolved to pending/expired here so the table never has to reason
    // about clocks.
    return {
        devices: devices.map(device => {
            const issued = codes.get(device.id);

            return {
                ...device,
                config: readPosConfig(device.config),
                code: issued
                    ? {
                        code: issued.code,
                        expiresAt: issued.expiresAt,
                        state: enrollmentCodeState(issued),
                    }
                    : null,
            };
        }),
        pairing: {
            status: superuserStatus(),
            tokenExpiresAt: superuserTokenExpiresAt(),
        },
    };
};

export const actions: Actions = {
    setActive: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();
        const active = formData.get('active')?.toString() === 'true';

        if (!deviceId) return fail(400, { error: 'missing-device' });

        await locals.pb.collection('pos_devices').update(deviceId, { active });

        return { success: true };
    },

    saveConfig: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();

        if (!deviceId) return fail(400, { error: 'missing-device' });

        await locals.pb.collection('pos_devices').update(deviceId, {
            config: posConfigFromForm(formData),
        });

        return { success: true, action: 'saveConfig', deviceId };
    },

    /**
     * Creates the device here, in backstage, and hands back a code to type into it. The
     * tablet never sees a login — that is the whole point of the pairing flow.
     */
    createDevice: async ({ request, params, locals }) => {
        ensureUser(locals, ['bar-manager']);

        // Checked before the row exists, so a misconfigured server doesn't leave behind
        // devices nobody can ever pair.
        if (superuserStatus() !== 'ready') return fail(503, { error: 'pairing-unavailable' });

        const formData = await request.formData();
        const label = formData.get('label')?.toString()?.trim();
        const kind = formData.get('kind')?.toString() as PosDeviceKind;

        if (!label || (kind !== 'kiosk' && kind !== 'staff')) {
            return fail(400, { error: 'missing-fields' });
        }

        const bar = await locals.pb.collection<Bar>('bars').getFirstListItem(
            locals.pb.filter('slug = {:slug}', { slug: params.ref }),
        );

        const device = await locals.pb.collection<PosDevice>('pos_devices').create({
            label,
            bar: bar.id,
            kind,
            config: posConfigFromForm(formData),
            active: true,
            enrolledBy: locals.user!.id,
        });

        const { code } = await issueEnrollmentCode(locals.pb, device.id);

        return { success: true, action: 'createDevice', deviceId: device.id, code };
    },

    /**
     * A new code, for a code that lapsed or a tablet being paired again. The device acts
     * as whoever issued its current code, so `enrolledBy` moves along with it.
     */
    regenerateCode: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        if (superuserStatus() !== 'ready') return fail(503, { error: 'pairing-unavailable' });

        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();

        if (!deviceId) return fail(400, { error: 'missing-device' });

        // The device acts as whoever issued its current code.
        await locals.pb.collection('pos_devices').update(deviceId, { enrolledBy: locals.user!.id });

        const { code } = await issueEnrollmentCode(locals.pb, deviceId);

        return { success: true, action: 'regenerateCode', deviceId, code };
    },

    /**
     * Drops a device that never paired. A tablet that has checked in keeps its row —
     * deleting it would orphan the orders still sitting in its outbox. Deactivate is the
     * operation for those.
     */
    discardDevice: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();

        if (!deviceId) return fail(400, { error: 'missing-device' });

        const device = await locals.pb.collection<PosDevice>('pos_devices').getOne(deviceId);

        if (device.lastSeen) {
            return fail(409, { error: 'device-in-use' });
        }

        // The code row hangs off the device with cascade delete, so it goes with it.
        await locals.pb.collection('pos_devices').delete(deviceId);

        return { success: true, action: 'discardDevice', deviceId };
    },
};
