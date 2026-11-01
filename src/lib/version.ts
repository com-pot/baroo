export const AppVersion: string = __APP_VERSION__;
export const BuildDate: string = __BUILD_DATE__;
export const AppHomepage = __APP_HOMEPAGE__;

const buildDateFormatter = new Intl.DateTimeFormat('cs', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

export function formatBuildDate(iso: string = BuildDate): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : buildDateFormatter.format(date);
}
