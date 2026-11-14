import type z from 'zod';
import type { WifiNetwork } from '$lib/settings/wifiNetworks';

/** What a config file needs besides the config itself */
export type TapConfigContext = {
    /** e.g.: "Pípa 1", for the file's header */
    label: string;
    barSlug: string;
    /** `null` when the picked network is gone */
    wifi: WifiNetwork | null;
    /** Empty for the checksum */
    token: string;
    /** Empty for the checksum */
    validThrough: string;
};

/** A kind of tap device, its config form and the config file it gets */
export type TapModel<Schema extends z.ZodObject = z.ZodObject> = {
    key: string;
    configSchema: Schema;
    materialize(config: z.infer<Schema>, ctx: TapConfigContext): string;
};

/** Passed into the file as it is - only for values validated to be valid python */
export function pyRaw(source: string): string {
    return source;
}

/** A python literal of a JSON-like value */
export function pyLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`not a python number: ${value}`);
        return String(value);
    }
    // JSON escapes are valid python string escapes
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(pyLiteral).join(', ')}]`;
    if (typeof value === 'object') {
        return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pyLiteral(item)}`).join(', ')}}`;
    }

    throw new Error(`not a python literal: ${typeof value}`);
}
