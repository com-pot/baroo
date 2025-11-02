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
            pb?: import('pocketbase').default;

            acl: {
                hasRole: (role: string) => boolean;
            },
        }
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
