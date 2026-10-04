import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { Bar } from "$lib/bar/BarModel";
import { getMemberTimeline } from "$lib/bar/stats/memberSummaries";
import { json } from "@sveltejs/kit";
import { ensureUser } from "$lib/acl.server";

export const GET: RequestHandler = async ({ params, locals }) => {
    ensureUser(locals, ['bar-manager']);

    const ref = params.ref;
    if (ref === 'new') {
        return error(400, { message: 'Cannot get timeline for this bar' });
    }

    const memberId = params.memberId?.toString();

    if (!memberId) {
        return error(400, { message: 'Member is required' });
    }

    const bar = await locals.pb.collection<Bar>('bars')
        .getFirstListItem(`slug="${ref}"`);

    const timeline = await getMemberTimeline(locals.pb, { slug: bar.slug }, memberId);

    return json(timeline);
}
