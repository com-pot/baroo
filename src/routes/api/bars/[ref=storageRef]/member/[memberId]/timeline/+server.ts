import { parseStorageRef } from "$lib/bar/refs";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { Bar } from "$lib/bar/BarModel";
import { getMemberTimeline } from "$lib/bar/stats/memberSummaries";
import { json } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.pb) {
        return error(500, { message: 'PocketBase not initialized' });
    }

    const ref = parseStorageRef(params.ref);
    if (ref.type === 'local' || ref.key === 'new') {
        return error(400, { message: 'Cannot get timeline for this bar' });
    }

    const memberId = params.memberId?.toString();

    if (!memberId) {
        return error(400, { message: 'Member is required' });
    }

    const bar = await locals.pb.collection<Bar>('bars')
        .getFirstListItem(`slug="${ref.key}"`);

    const timeline = await getMemberTimeline(locals.pb, { slug: bar.slug }, memberId);

    return json(timeline);
}
