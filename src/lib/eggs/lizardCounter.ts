import type { CounterState } from './eggs.svelte';
import { gztDeviceId } from './deviceId';

/** The one counter the lizard has ever pushed. Must exist in PocketBase — see counters.server.ts. */
const COUNTER = 'lizard';

const read = async (res: Response): Promise<CounterState> => {
    // Throwing lets TotalCounter hold on to the delta and retry it, so a blip mid-evening
    // costs nobody their clicks.
    if (!res.ok) throw new Error(`counter ${COUNTER}: ${res.status}`);

    const data = await res.json();
    return { total: data.count ?? 0, mine: data.mine ?? 0 };
};

/** `TotalCounterStorage` against `/api/counters/lizard`. */
export const lizardCounterStorage = {
    load: () => {
        const params = new URLSearchParams({ device: gztDeviceId() });
        return fetch(`/api/counters/${COUNTER}?${params}`).then(read);
    },

    push: (delta: number) =>
        fetch(`/api/counters/${COUNTER}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta, deviceId: gztDeviceId() }),
        }).then(read),
};
