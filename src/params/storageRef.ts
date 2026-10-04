import type { ParamMatcher } from "@sveltejs/kit";

const pattern = /^[a-z0-9_\-]+$/

export const match = ((param): boolean => {
    return pattern.test(param);
}) satisfies ParamMatcher
