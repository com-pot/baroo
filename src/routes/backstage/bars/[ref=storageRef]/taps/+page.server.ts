import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import z from 'zod';
import { ensureUser } from '$lib/acl.server';
import type { Bar } from '$lib/bar/BarModel';
import type { PosDevice } from '$lib/pos/device';
import { toIsoDate } from '$lib/pocketbase';
import { wifiNetworkSchema } from '$lib/settings/wifiNetworks';
import { BarTapsCollection, type BarTap } from '$lib/taps/barTap';
import {
    createTap,
    parseTapConfig,
    readBarWifiNetworks,
    readStoredTapConfig,
    tapAuthorization,
    writeBarWifiNetworks,
} from '$lib/taps/tapAdmin.server';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { bar } = await parent();
    if (!bar) return { taps: [], wifiNetworks: [], devices: [] };

    const [taps, wifiNetworks, devices] = await Promise.all([
        locals.pb.collection<BarTap>(BarTapsCollection).getFullList({
            filter: locals.pb.filter('bar = {:bar}', { bar: bar.id }),
            sort: 'sequence',
            expand: 'nowServing,posDevice',
        }),
        readBarWifiNetworks(locals.pb, bar.slug),
        locals.pb.collection<PosDevice>('pos_devices').getFullList({
            filter: locals.pb.filter('bar = {:bar}', { bar: bar.id }),
            sort: 'label',
            fields: 'id,label',
        }),
    ]);

    return {
        taps: taps.map((tap) => ({
            id: tap.id,
            sequence: tap.sequence,
            name: tap.name,
            model: tap.model,
            posDevice: tap.posDevice,
            posDeviceLabel: tap.expand?.posDevice?.label ?? null,
            nowServing: tap.expand?.nowServing?.name ?? null,
            config: readStoredTapConfig(tap),
            validThrough: toIsoDate(tap.validThrough) || null,
            lastSeen: toIsoDate(tap.lastSeen) || null,
            authorization: tapAuthorization(tap, bar, wifiNetworks),
        })),
        // Passwords stay here, the form only picks a network
        wifiNetworks: wifiNetworks.map(({ password: _, ...network }) => network),
        devices: devices.map((device) => ({ id: device.id, label: device.label })),
    };
};

const tapFormSchema = z.object({
    name: z.string().trim().max(40),
    posDevice: z.string().transform((id) => id || null),
});

const wifiFormSchema = wifiNetworkSchema.extend({
    id: z.string().max(32).transform((id) => id || randomUUID().slice(0, 8)),
    country: z.string().trim().toUpperCase().pipe(wifiNetworkSchema.shape.country),
    /** Empty keeps the stored one */
    password: z.string().max(63),
});

export const actions: Actions = {
    createTap: async ({ request, locals, params }) => {
        ensureUser(locals, ['bar-manager']);
        const bar = await barOf(locals, params.ref);

        const input = tapFormSchema.safeParse(Object.fromEntries(await request.formData()));
        if (!input.success) return fail(400, { error: 'invalid-data' });

        const tap = await createTap(locals.pb, bar, input.data);
        return { success: true, action: 'createTap', tapId: tap.id };
    },

    saveTap: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        const formData = await request.formData();
        const tapId = formData.get('tapId')?.toString();
        if (!tapId) return fail(400, { error: 'missing-tap' });

        const input = tapFormSchema.safeParse(Object.fromEntries(formData));
        if (!input.success) return fail(400, { error: 'invalid-data' });

        const tap = await locals.pb.collection<BarTap>(BarTapsCollection).getOne(tapId);
        const config = parseTapConfig(tap, parseJson(formData.get('config')));
        if (!config) return fail(400, { error: 'invalid-config' });

        await locals.pb.collection(BarTapsCollection).update(tapId, {
            name: input.data.name,
            posDevice: input.data.posDevice ?? '',
            config,
        });

        return { success: true, action: 'saveTap', tapId };
    },

    deleteTap: async ({ request, locals }) => {
        ensureUser(locals, ['bar-manager']);

        const tapId = (await request.formData()).get('tapId')?.toString();
        if (!tapId) return fail(400, { error: 'missing-tap' });

        await locals.pb.collection(BarTapsCollection).delete(tapId);
        return { success: true, action: 'deleteTap', tapId };
    },

    saveWifi: async ({ request, locals, params }) => {
        ensureUser(locals, ['bar-manager']);
        const bar = await barOf(locals, params.ref);

        const input = wifiFormSchema.safeParse(Object.fromEntries(await request.formData()));
        if (!input.success) return fail(400, { error: 'invalid-wifi' });

        const networks = await readBarWifiNetworks(locals.pb, bar.slug);
        const known = networks.find((network) => network.id === input.data.id);
        const network = { ...input.data, password: input.data.password || known?.password || '' };

        await writeBarWifiNetworks(locals.pb, bar.slug, known
            ? networks.map((candidate) => candidate.id === network.id ? network : candidate)
            : [...networks, network]);

        return { success: true, action: 'saveWifi' };
    },

    removeWifi: async ({ request, locals, params }) => {
        ensureUser(locals, ['bar-manager']);
        const bar = await barOf(locals, params.ref);

        const id = (await request.formData()).get('id')?.toString();
        const networks = await readBarWifiNetworks(locals.pb, bar.slug);
        await writeBarWifiNetworks(locals.pb, bar.slug, networks.filter((network) => network.id !== id));

        return { success: true, action: 'removeWifi' };
    },
};

function barOf(locals: App.Locals, slug: string): Promise<Bar> {
    return locals.pb.collection<Bar>('bars').getFirstListItem(locals.pb.filter('slug = {:slug}', { slug }));
}

function parseJson(value: FormDataEntryValue | null): unknown {
    try {
        return JSON.parse(String(value ?? 'null'));
    } catch {
        return null;
    }
}
