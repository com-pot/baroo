/**
 * What this bundle is.
 *
 * Frozen at build time by Vite's `define`, not read from a server: a kiosk spends the
 * evening offline, so "which build is on this tablet?" has to be answerable from the
 * tablet alone — which is exactly when the question gets asked.
 */
export const APP_VERSION: string = __APP_VERSION__;

/** ISO instant the bundle was built. In `vite dev` this is when the dev server started. */
export const BUILD_DATE: string = __BUILD_DATE__;

const buildDateFormatter = new Intl.DateTimeFormat('cs', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

/** The build date as a barman would read it off the screen. */
export function formatBuildDate(iso: string = BUILD_DATE): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : buildDateFormatter.format(date);
}
