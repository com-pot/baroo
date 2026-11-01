import { error } from '@sveltejs/kit';
import userRoles from './auth/userRoles';

export function ensureUser(locals: App.Locals, roles?: (keyof typeof userRoles)[]) {
    if (!locals.user) {
        error(401, 'unauthenticated');
    }
    const missingRoles = roles?.filter((role) => !locals.acl.hasRole(role))

    if (missingRoles?.length) {
        error(403, 'unauthorized');
    }
}
