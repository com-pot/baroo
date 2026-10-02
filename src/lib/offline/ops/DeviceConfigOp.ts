import type { PosDeviceConfig } from '$lib/pos/device';

export type DeviceConfigOp = {
    kind: 'device-config';
    config: PosDeviceConfig;
};
