import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.pb) {
        return new Response('PocketBase not initialized', { status: 500 });
    }

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
    if (!locals.pb) {
        return new Response('PocketBase not initialized', { status: 500 });
    }

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

        await locals.pb.collection('events')
            .create({
                type: 'counter-increase',
                target: `counter:${name}`,
                data: {
                    delta,
                    newCount,
                },
            })

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
