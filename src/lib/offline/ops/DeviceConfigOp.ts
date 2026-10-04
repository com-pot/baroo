import type { PosDeviceConfig } from '$lib/pos/device';
import z from 'zod';

const schema = z.object({
    kind: z.literal("device-config"),
    deviceId: z.string().min(1),
    config: z.object(),
})

export type DeviceConfigOp = {
    kind: 'device-config';
    deviceId: string;
    config: PosDeviceConfig;
};
