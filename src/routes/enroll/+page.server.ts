import { fail } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import type { Bar } from '$lib/bar/BarModel';
import type { PosDeviceKind } from '$lib/pos/device';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user || !locals.acl.hasRole('bar-manager')) {
        return { bars: [], authenticated: false, loginUrl: `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`, preselectBar: null };
    }

    const bars = await locals.pb.collection<Bar>('bars').getFullList({ sort: 'name' });

    // Enrolling from a bar's PoS page preselects that bar — picking the wrong one from a
    // growing list silently binds a tablet to the wrong data.
    const requestedBar = url.searchParams.get('bar');
    const preselectBar = bars.find(bar => bar.slug === requestedBar)?.id ?? null;

    return { bars, authenticated: true, loginUrl: null, preselectBar };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        if (!locals.user || !locals.acl.hasRole('bar-manager')) {
            return fail(403, { error: 'unauthorized' });
        }

        const formData = await request.formData();
        const barId = formData.get('bar')?.toString();
        const label = formData.get('label')?.toString()?.trim();
        const kind = formData.get('kind')?.toString() as PosDeviceKind;

        if (!barId || !label || (kind !== 'kiosk' && kind !== 'staff')) {
            return fail(400, { error: 'missing-fields' });
        }

        try {
            const bar = await locals.pb.collection<Bar>('bars').getOne(barId);

            const device = await locals.pb.collection('pos_devices').create({
                label,
                bar: bar.id,
                kind,
                active: true,
                enrolledBy: locals.user.id,
                lastSeen: new Date().toISOString(),
            });

            // The tablet acts as the barman who enrolled it. This is the one place the
            // token leaves the server; from here it lives in the tablet's IndexedDB and
            // is refreshed on every device-authenticated response.
            return {
                enrolled: {
                    deviceId: device.id,
                    token: locals.pb.authStore.token,
                    label,
                    kind,
                    barSlug: bar.slug,
                    barName: bar.name,
                    enrolledAt: new Date().toISOString(),
                },
            };
        } catch (err) {
            if (err instanceof ClientResponseError) {
                return fail(400, { error: err.message });
            }
            throw err;
        }
    },
};
