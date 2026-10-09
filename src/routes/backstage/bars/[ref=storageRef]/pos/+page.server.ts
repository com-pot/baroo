import { fail } from '@sveltejs/kit';
import { ensureUser } from '$lib/acl.server';
import { superuserStatus, superuserTokenExpiresAt } from '$lib/db.server';
import type { Bar } from '$lib/bar/BarModel';
import { issueEnrollmentCode, listEnrollmentCodes } from '$lib/pos/enrollment.server';
import { enrollmentCodeState } from '$lib/pos/enrollmentCode';
import { createDeviceSchema, posConfigFromForm, readPosConfig, type PosDevice } from '$lib/pos/device';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const devices = await locals.pb.collection<PosDevice>('pos_devices')
        .getFullList({
            filter: locals.pb.filter('bar.slug = {:slug}', { slug: params.ref }),
            sort: '-created',
            expand: 'enrolledBy',
        });

    const codes = await listEnrollmentCodes(locals.pb, params.ref);

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

    createDevice: async ({ request, params, locals }) => {
        ensureUser(locals, ['bar-manager']);
        if (superuserStatus() !== 'ready') return fail(503, { error: 'pairing-unavailable' });

        const formData = await request.formData()
        const parseResult = createDeviceSchema.safeParse(formData)
        if (!parseResult.success) {
            return fail(400, { error: 'missing-fields', details: parseResult.error });
        }

        const bar = await locals.pb.collection<Bar>('bars').getFirstListItem(
            locals.pb.filter('slug = {:slug}', { slug: params.ref }),
        );

        const device = await locals.pb.collection<PosDevice>('pos_devices').create({
            label: parseResult.data.label,
            bar: bar.id,
            kind: parseResult.data.kind,
            config: posConfigFromForm(formData),
            active: true,
            enrolledBy: locals.user!.id,
        });

        const { code } = await issueEnrollmentCode(locals.pb, device.id);

        return { success: true, action: 'createDevice', deviceId: device.id, code };
    },

    regenerateCode: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        if (superuserStatus() !== 'ready') return fail(503, { error: 'pairing-unavailable' });

        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();

        if (!deviceId) return fail(400, { error: 'missing-device' });

        await locals.pb.collection('pos_devices').update(deviceId, { enrolledBy: locals.user!.id });

        const { code } = await issueEnrollmentCode(locals.pb, deviceId);

        return { success: true, action: 'regenerateCode', deviceId, code };
    },

    discardDevice: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();

        if (!deviceId) return fail(400, { error: 'missing-device' });

        const device = await locals.pb.collection<PosDevice>('pos_devices').getOne(deviceId);

        if (device.lastSeen) {
            return fail(409, { error: 'device-in-use' });
        }

        await locals.pb.collection('pos_devices').delete(deviceId);

        return { success: true, action: 'discardDevice', deviceId };
    },
};
