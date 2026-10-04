import type { PosDeviceConfig } from '$lib/pos/device';
import z from 'zod';

const schema = z.object({
    kind: z.enum(["device-config"]),
    config: z.object(),
})

export type DeviceConfigOp = {
    kind: 'device-config';
    config: PosDeviceConfig;
};
