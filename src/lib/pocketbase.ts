export function toIsoDate(value: string | undefined | null): string {
    if (!value) return '';
    return value.includes('T') ? value : value.replace(' ', 'T');
}

export function toPbDate(value: string): string {
    return value.replace('T', ' ');
}

export function pbResponseErrorMessage(err: unknown): string {
    const response = (err as { response?: { message?: string } })?.response;
    const message = response?.message || (err instanceof Error ? err.message : String(err));
    return message
}
