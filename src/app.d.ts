// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Logger } from 'pino';

// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            logger: Logger;

            user?: {
                id: string;
                email: string;
                name?: string;
                roles?: string[];
            };
            pb: import('pocketbase').default;

            device?: import('$lib/pos/device').PosDevice;

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
