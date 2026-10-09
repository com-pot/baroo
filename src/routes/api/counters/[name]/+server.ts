import { pushCounter, readCounter, type CounterState } from "$lib/counters/counters.server";
import type { RequestHandler } from "./$types";

const json = (state: CounterState) => new Response(JSON.stringify(state), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
});

const failed = (err: unknown, what: string) => {
    if ((err as { status?: number })?.status === 404) {
        return new Response('Counter not found', { status: 404 });
    }
    console.error(err)
    return new Response(what, { status: 500 });
};

/** Devices name themselves; nothing is authenticated, so only the shape is worth checking. */
const readDeviceId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const deviceId = value.trim();
    return deviceId && deviceId.length <= 64 ? deviceId : null;
};

export const GET: RequestHandler = async ({ params, url, locals }) => {
    const name = params.name?.toString();

    if (!name) {
        return new Response('Counter name is required', { status: 400 });
    }

    try {
        return json(await readCounter(locals.pb, name, readDeviceId(url.searchParams.get('device'))));
    } catch (err: unknown) {
        return failed(err, 'Failed to load counter');
    }
}

export const PUT: RequestHandler = async ({ request, params, locals }) => {
    const name = params.name?.toString();

    if (!name) {
        return new Response('Counter name is required', { status: 400 });
    }

    try {
        const { delta, deviceId } = await request.json();

        if (!Number.isInteger(delta)) {
            return new Response('Invalid request body: delta integer required', { status: 400 });
        }

        return json(await pushCounter(locals.pb, name, delta, readDeviceId(deviceId)));
    } catch (err: unknown) {
        return failed(err, 'Failed to update counter');
    }
}
