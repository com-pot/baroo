import z from 'zod';

export const WIFI_NETWORKS_KEY = 'wifiNetworks';

export const wifiNetworkSchema = z.object({
    id: z.string().min(1).max(32),
    /** Two-letter code, it decides which channels the radio may use */
    country: z.string().regex(/^[A-Z]{2}$/).or(z.literal('')),
    ssid: z.string().min(1).max(32),
    password: z.string().max(63),
});

export type WifiNetwork = z.infer<typeof wifiNetworkSchema>;

export const wifiNetworksSchema = z.array(wifiNetworkSchema);

export function readWifiNetworks(raw: unknown): WifiNetwork[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
        const parsed = wifiNetworkSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
    });
}
