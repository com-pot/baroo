import type { Db } from '$lib/db.server';

export type CounterState = {
    name: string,
    count: number,
    /** The named device's share of `count`, or 0 when no device asked. */
    mine: number,
}

/**
 * The tail of each counter's queue of pushes, keyed by counter name.
 *
 * A push is a read-modify-write, and the lizard counter is now clicked by whoever finds the
 * page rather than by one tablet, so concurrent pushes are the normal case. Chaining them
 * means PocketBase sees one at a time per counter and the contribution row cannot be
 * created twice. It only holds within this process: keep pm2 on `fork`, not `cluster`.
 */
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const tail = queues.get(key) ?? Promise.resolve();

    // Run regardless of how the one in front finished — a failed push must not wedge the queue.
    const next = tail.then(task, task);

    const guarded = next.catch(() => {});
    queues.set(key, guarded);

    // Last one out drops the key, so the map tracks live queues rather than every counter
    // that has ever been named.
    guarded.then(() => {
        if (queues.get(key) === guarded) queues.delete(key);
    });

    return next;
}

const counterFilter = (pb: Db, name: string) => pb.filter('name = {:name}', { name });

/** Throws PocketBase's 404 when the counter row does not exist — they are seeded by hand. */
async function loadCounter(pb: Db, name: string) {
    return pb.collection('counters').getFirstListItem(counterFilter(pb, name));
}

async function loadContribution(pb: Db, counterId: string, deviceId: string) {
    return pb
        .collection('counter_contributions')
        .getFirstListItem(
            pb.filter('counter = {:counter} && deviceId = {:deviceId}', {
                counter: counterId,
                deviceId,
            }),
        )
        .catch((err: { status?: number }) => {
            if (err?.status === 404) return null;
            throw err;
        });
}

export async function readCounter(pb: Db, name: string, deviceId: string | null): Promise<CounterState> {
    const counter = await loadCounter(pb, name);

    const contribution = deviceId ? await loadContribution(pb, counter.id, deviceId) : null;

    return {
        name: counter.name,
        count: counter.value || 0,
        mine: contribution?.value || 0,
    };
}

/**
 * Adds `delta` to the counter, and to the device's own tally when one is named.
 *
 * The increments go through PocketBase's `+` field modifier rather than a value we worked
 * out here: the queue above already keeps this process honest, but the modifier is what
 * keeps the number right across a restart overlap or a second instance.
 */
export function pushCounter(
    pb: Db,
    name: string,
    delta: number,
    deviceId: string | null,
): Promise<CounterState> {
    return enqueue(name, async () => {
        const counter = await loadCounter(pb, name);

        const updated = await pb
            .collection('counters')
            .update(counter.id, { 'value+': delta });

        return {
            name: updated.name,
            count: updated.value || 0,
            mine: deviceId ? await pushContribution(pb, counter.id, deviceId, delta) : 0,
        };
    });
}

async function pushContribution(pb: Db, counterId: string, deviceId: string, delta: number) {
    const existing = await loadContribution(pb, counterId, deviceId);

    const record = existing
        ? await pb.collection('counter_contributions').update(existing.id, { 'value+': delta })
        : await pb
              .collection('counter_contributions')
              .create({ counter: counterId, deviceId, value: Math.max(delta, 0) });

    return record.value || 0;
}
