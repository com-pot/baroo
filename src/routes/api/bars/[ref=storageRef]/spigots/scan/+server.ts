import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { normalizeTag } from '$lib/bar/tags';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { lookupBeverageTag } from '$lib/spigots/beverageTags.server';
import { emit, touchStation } from '$lib/spigots/spigotHub.server';
import { spigotScanSchema, type SpigotScanResult } from '$lib/spigots/spigotEvents';

/**
 * A card on a spigot station's reader.
 *
 * Either a beverage tag, which switches the station to that drink and has the kiosk open
 * a new package of it, or anybody else's card, which goes to the kiosk as a pour waiting
 * for a size. Who the card belongs to is the kiosk's question, not ours: it answers from
 * its snapshot and outbox, so a member enrolled on the tablet ten minutes ago pours like
 * anyone else.
 *
 * Nothing here touches PocketBase. This has to work with the venue's uplink down.
 */
export const POST: RequestHandler = async (event) => {
    requireStation(event);

    const barSlug = event.params.ref;
    const body = spigotScanSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { spigot, uid, beverage? }');

    const { spigot } = body.data;
    const serialId = normalizeTag(body.data.uid);
    const at = new Date().toISOString();

    const beverageTag = await lookupBeverageTag(barSlug, serialId);
    if (beverageTag) {
        touchStation(barSlug, spigot, beverageTag.key);
        emit(barSlug, {
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
    touchStation(barSlug, spigot, beverage);

    if (!beverage) {
        emit(barSlug, { type: 'spigot-unset', spigot, serialId, at });
        return reply({ result: 'no-beverage' });
    }

    const delivered = emit(barSlug, { type: 'pour', id: randomUUID(), spigot, serialId, beverage, at });

    return reply({ result: 'pour', delivered });
};

const reply = (result: SpigotScanResult) => json(result);
