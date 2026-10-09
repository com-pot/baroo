export function toIsoDate(value: string | undefined | null): string {
    if (!value) return '';
    return value.includes('T') ? value : value.replace(' ', 'T');
}

export function toPbDate(value: string): string {
    return value.replace('T', ' ');
}
