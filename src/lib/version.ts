export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_DATE: string = __BUILD_DATE__;

const buildDateFormatter = new Intl.DateTimeFormat('cs', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

export function formatBuildDate(iso: string = BUILD_DATE): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : buildDateFormatter.format(date);
}
