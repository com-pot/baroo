import { browser } from '$app/environment';

const DEVICE_KEY = 'baroo.gzt.deviceId';

const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Whatever id we handed out this session, so a browser that refuses to remember one still
 * gets a stable answer for as long as the tab lives.
 */
let cached: string | null = null;

/**
 * The name this browser clicks under.
 *
 * Not the POS `DeviceIdentity` and not `x-device-id`: those mean "a tablet somebody
 * enrolled", and they are checked. This is an anonymous handle whose only job is to tell
 * one visitor's clicks apart from everyone else's, so it is worth exactly nothing to forge.
 *
 * localStorage rather than the offline DB because it is read synchronously while the toy is
 * being wired up, and because losing it costs a contribution count, not any real state.
 */
export function gztDeviceId(): string {
    if (cached) return cached;
    if (!browser) return '';

    // Storage is allowed to be missing or to throw outright (private window, a tablet with
    // site data locked down). The toy still has to work; only surviving a reload is lost.
    try {
        const stored = localStorage.getItem(DEVICE_KEY);
        if (stored) return (cached = stored);
    } catch {
        return (cached = newId());
    }

    cached = newId();
    try {
        localStorage.setItem(DEVICE_KEY, cached);
    } catch {
        // Session-only id, as above.
    }
    return cached;
}
