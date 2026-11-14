// See https://svelte.dev/docs/kit/types#app.d.ts

import type { ServerI18n } from '$lib/server/i18n.server';
import type { Logger } from 'pino';

// for information about these interfaces
declare global {
    namespace App {
        interface Error {
            message: string,
            details?: Record<string, unnknown>,
        }
        interface Locals {
            logger: Logger;
            i18n: ServerI18n;

            user?: {
                id: string;
                email: string;
                name?: string;
                roles?: string[];
            };
            pb: import('pocketbase').default;

            acl: {
                hasRole: (role: string) => boolean;
            },
        }
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }

    const __APP_VERSION__: string;
    const __BUILD_DATE__: string;
    const __APP_HOMEPAGE__: string;
}

export {};
