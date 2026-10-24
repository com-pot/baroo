import { fail } from '@sveltejs/kit';
import type { Bar } from '$lib/bar/BarModel';
import type { PosDevice } from '$lib/pos/device';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const devices = await locals.pb.collection<PosDevice>('pos_devices')
        .getFullList({ sort: '-lastSeen', expand: 'bar,enrolledBy' });

    const bars = await locals.pb.collection<Bar>('bars').getFullList({ sort: 'name' });

    return { devices, bars };
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

    setBar: async ({ request, locals }) => {
        const formData = await request.formData();
        const deviceId = formData.get('deviceId')?.toString();
        const barId = formData.get('bar')?.toString();

        if (!deviceId || !barId) return fail(400, { error: 'missing-fields' });

        await locals.pb.collection('pos_devices').update(deviceId, { bar: barId });

        return { success: true };
    },
};
