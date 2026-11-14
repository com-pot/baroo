import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tapLabel } from '$lib/taps/barTap';
import { requireTap } from '$lib/taps/tapAuth.server';
import { broadcastTaps } from '$lib/taps/tapBoard.server';
import { type TapHelloResult } from '$lib/taps/tapEvents';

export const POST: RequestHandler = async (event) => {
    const session = await requireTap(event);

    await broadcastTaps({...event.locals, pb: session.pb}, session.tap.bar.slug);

    return json({
        label: tapLabel(session.tap).normalize('NFD').replaceAll(/[^\x20-\x7e]/g, ''),
    } satisfies TapHelloResult);
};
