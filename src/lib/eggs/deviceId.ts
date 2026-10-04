import { browser } from '$app/environment';

const DEVICE_KEY = 'baroo.gzt.deviceId';

const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let cached: string | null = null;

export function gztDeviceId(): string {
    if (cached) return cached;
    if (!browser) return '';

    try {
        const stored = localStorage.getItem(DEVICE_KEY);
        if (stored) return (cached = stored);
    } catch {
        // continue: to try to create id
    }

    cached = newId();
    try {
        localStorage.setItem(DEVICE_KEY, cached);
    } catch {
        // can't persist id: session-only id
    }

    return cached;
}
