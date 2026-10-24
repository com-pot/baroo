import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { normalizeTag } from '$lib/bar/tags';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { lookupBeverageTag } from '$lib/spigots/beverageTags.server';
import { emit, touchStation } from '$lib/spigots/spigotHub.server';
import { spigotScanSchema, type SpigotScanResult } from '$lib/spigots/spigotEvents';

/**
 * Card tapped at a spigot station
 *
 * A beverage tag switches the station's drink and has the kiosk open a new package,
 * any other card goes to the kiosk as a pour. Members are resolved by the kiosk.
 * Must work without PocketBase.
 */
export const POST: RequestHandler = async (event) => {
    requireStation(event);

    const { locals } = event;
    const barSlug = event.params.ref;
    const body = spigotScanSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { spigot, uid, beverage? }');

    const { spigot } = body.data;
    const serialId = normalizeTag(body.data.uid);
    const at = new Date().toISOString();

    const beverageTag = await lookupBeverageTag(locals, barSlug, serialId);
    if (beverageTag) {
        touchStation(locals, barSlug, spigot, beverageTag.key);
        emit(locals, barSlug, {
            type: 'spigot-assigned',
            id: randomUUID(),
            spigot,
            beverage: beverageTag.key,
            name: beverageTag.name,
            at,
        });

        return reply({ result: 'beverage', beverage: beverageTag });
    }

    const beverage = body.data.beverage || null;
    touchStation(locals, barSlug, spigot, beverage);

    if (!beverage) {
        emit(locals, barSlug, { type: 'spigot-unset', spigot, serialId, at });
        return reply({ result: 'no-beverage' });
    }

    const delivered = emit(locals, barSlug, { type: 'pour', id: randomUUID(), spigot, serialId, beverage, at });

    return reply({ result: 'pour', delivered });
};

const reply = (result: SpigotScanResult) => json(result);
