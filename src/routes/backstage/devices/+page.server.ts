import type { Bar } from '$lib/bar/BarModel';
import type { PosDevice } from '$lib/pos/device';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const devices = await locals.pb.collection<PosDevice>('pos_devices')
        .getFullList({ sort: '-lastSeen', expand: 'bar,enrolledBy' });

    const bars = await locals.pb.collection<Bar>('bars').getFullList({ sort: 'name' });

    return { devices, bars };
};
