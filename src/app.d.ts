// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            user?: {
                id: string;
                email: string;
                name?: string;
                roles?: string[];
            };
            /**
             * Always present. Anonymous unless the request carried a valid session
             * cookie — check `locals.user` to know which.
             */
            pb: import('pocketbase').default;

            /** Set only on device-authenticated routes, by `resolveDevice`. */
            device?: import('$lib/pos/device').PosDevice;

            acl: {
                hasRole: (role: string) => boolean;
            },
        }
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }

    /** Injected by Vite's `define` — see the `define` block in vite.config.ts. */
    const __APP_VERSION__: string;
    const __BUILD_DATE__: string;
}

export {};
