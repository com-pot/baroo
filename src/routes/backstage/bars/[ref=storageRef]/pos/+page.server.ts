import { fail } from '@sveltejs/kit';
import { POS_THEMES, readPosConfig, type PosDevice, type PosDeviceConfig, type PosTheme } from '$lib/pos/device';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const devices = await locals.pb.collection<PosDevice & { enrolledBy?: string }>('pos_devices')
        .getFullList({
            filter: `bar.slug = "${params.ref}"`,
            sort: '-lastSeen',
            expand: 'enrolledBy',
        });

    // Config is normalised here so the form never has to reason about a missing field.
    return {
        devices: devices.map(device => ({ ...device, config: readPosConfig(device.config) })),
    };
};

export const actions: Actions = {
    setActive: async ({ request, locals }) => {
        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();
        const active = formData.get('active')?.toString() === 'true';

        if (!deviceId) return fail(400, { error: 'missing-device' });

        await locals.pb.collection('pos_devices').update(deviceId, { active });

        return { success: true };
    },

    saveConfig: async ({ request, locals }) => {
        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();

        if (!deviceId) return fail(400, { error: 'missing-device' });

        const theme = formData.get('theme')?.toString() as PosTheme;

        const config: PosDeviceConfig = {
            theme: POS_THEMES.includes(theme) ? theme : 'plain',
            // Unchecked boxes simply aren't submitted.
            genZToy: formData.get('genZToy') === 'on',
            idInput: formData.get('idInput') === 'on',
            greetingTemplate: formData.get('greetingTemplate')?.toString().trim() ?? '',
            customGreetings: formData.get('customGreetings') === 'on',
        };

        await locals.pb.collection('pos_devices').update(deviceId, { config });

        return { success: true, action: 'saveConfig', deviceId };
    },
};
