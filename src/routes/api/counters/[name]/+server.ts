import { pushCounter, readCounter } from "$lib/counters/counters.server";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const failed = (err: unknown, what: string) => {
    if ((err as { status?: number })?.status === 404) {
        return error(404, "Counter not found")
    }
    return error(500, what)
};

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
