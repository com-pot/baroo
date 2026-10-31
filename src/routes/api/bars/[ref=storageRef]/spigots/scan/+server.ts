import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { normalizeTag } from '$lib/bar/tags';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { lookupBeverageTag } from '$lib/spigots/spigotDirectory.server';
import { emit, touchStation } from '$lib/spigots/spigotHub.server';
import { SIZE_WAIT_MS, stationScreens } from '$lib/spigots/spigotScreens.server';
import { spigotScanSchema, type SpigotScanResult } from '$lib/spigots/spigotEvents';

/**
 * Card tapped at a spigot station
 *
 * A beverage tag switches the station's drink and has the kiosk open a new package,
 * any other card goes to the kiosk as a pour waiting for a serving from the kiosk or
 * the station's buttons (`../serve`). Members are resolved by the kiosk, the display
 * shows only cards known from the last snapshot pull. Must work without PocketBase.
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

    const drink = await lookupBeverageTag(locals, barSlug, serialId);
    if (drink) {
        touchStation(locals, barSlug, spigot, drink.key);
        emit(locals, barSlug, {
            type: 'spigot-assigned',
            id: randomUUID(),
            spigot,
            beverage: drink.key,
            name: drink.name,
            at,
        });

        return reply({
            result: 'beverage',
            beverage: { key: drink.key, name: drink.name },
            ...stationScreens(barSlug, spigot, drink.key, { view: 'assigned', spigot, beverage: drink.key }),
        });
    }

    const beverage = body.data.beverage || null;
    touchStation(locals, barSlug, spigot, beverage);

    if (!beverage) {
        emit(locals, barSlug, { type: 'spigot-unset', spigot, serialId, at });
        return reply({ result: 'no-beverage', ...stationScreens(barSlug, spigot, null, { view: 'unset', spigot }) });
    }

    const id = randomUUID();
    const delivered = emit(locals, barSlug, { type: 'pour', id, spigot, serialId, beverage, at });
    // Buttons are pointless with no kiosk to file the serving
    const buttons = !!body.data.buttons && delivered > 0;


    return reply({
        result: 'pour',
        pour: id,
        delivered,
        ...stationScreens(barSlug, spigot, beverage, {
            view: 'pour',
            spigot,
            beverage,
            serial: serialId,
            pick: buttons ? 'buttons' : undefined,
            warn: delivered ? undefined : 'no-kiosk',
        }, buttons ? SIZE_WAIT_MS : undefined),
    });
};

const reply = (result: SpigotScanResult) => json(result);
