import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
    const name = params.name?.toString();

    if (!name) {
        return new Response('Counter name is required', { status: 400 });
    }

    try {
        const counterRecord = await locals.pb
            .collection('counters')
            .getFirstListItem(`name="${name}"`);

        return new Response(JSON.stringify({
            name: counterRecord.name,
            count: counterRecord.value,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        if (err.status === 404) {
            return new Response('Counter not found', { status: 404 });
        }
        console.error(err)
        return new Response('Failed to load counter', { status: 500 });
    }
}

export const PUT: RequestHandler = async ({ request, params, locals }) => {
    const name = params.name?.toString();

    if (!name) {
        return new Response('Counter name is required', { status: 400 });
    }

    try {
        const { delta } = await request.json();

        if (typeof delta !== 'number') {
            return new Response('Invalid request body: delta number required', { status: 400 });
        }

        const counterRecord = await locals.pb
            .collection('counters')
            .getFirstListItem(`name="${name}"`);

        const newCount = (counterRecord.value || 0) + delta;

        const updatedRecord = await locals.pb
            .collection('counters')
            .update(counterRecord.id, { value: newCount });

        // The audit event needs a signed-in manager; the counter itself is public.
        // An anonymous kiosk should still be able to tick it, so this is best-effort.
        await locals.pb.collection('events')
            .create({
                type: 'counter-increase',
                target: `counter:${name}`,
                occurredAt: new Date().toISOString(),
                data: {
                    delta,
                    newCount,
                },
            })
            .catch(() => {})

        return new Response(JSON.stringify({
            name: updatedRecord.name,
            count: updatedRecord.value,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        if (err.status === 404) {
            return new Response('Counter not found', { status: 404 });
        }
        console.error(err)
        return new Response('Failed to update counter', { status: 500 });
    }
}
