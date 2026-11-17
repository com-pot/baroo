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
    /** What its device runs with the authorized config file, for a device backstage uploads to */
    runtime?(configFile: string): Promise<TapRuntime>;
};

export type TapRuntime = {
    /** By their path on the device, in the order to write them */
    files: [string, string][];
    /** Set up once with the device, outside baroo */
    prerequisites: string[];
}
