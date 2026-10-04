import type { Bar } from '$lib/bar/BarModel';
import z from 'zod';

export type PosDevice = {
    id: string;
    label: string;
    bar: string;
    kind: PosDeviceKind;
    active: boolean;
    lastSeen?: string;
    config?: Partial<PosDeviceConfig> | null;
    enrolledBy?: string;
    expand?: { bar?: Bar; enrolledBy?: { name?: string; email?: string } };
};

export const deviceKinds = ["kiosk", "staff"] as const
export const createDeviceSchema = z.object({
    kind: z.enum(deviceKinds),
    label: z.string().min(4),
    config: z.string().optional(),
})
export type PosDeviceCreate = z.infer<typeof createDeviceSchema>

export type PosDeviceKind = PosDeviceCreate["kind"];
export const GREETING_NAME_TOKEN = '{name}';

export const configSchema = z.object({
    theme: z.enum(['plain']).default("plain"),
    genZToy: z.boolean().default(false),
    idInput: z.enum(['', 'member', 'member-serial']).default('').meta({
        enumI18nPrefix: "baroo.pos.config.idInput.value."
    }),

    greetingTemplate: z.string().default("Ave, {name}"),
    customGreetings: z.boolean().default(true),
})

export type PosDeviceConfig = z.infer<typeof configSchema>

export function greetingFor(
    config: Pick<PosDeviceConfig, 'greetingTemplate' | 'customGreetings'>,
    member: { nickName?: string; greeting?: string },
): string | null {
    const template = config.greetingTemplate.trim();
    if (!template) return null;

    if (config.customGreetings && member.greeting?.trim()) {
        return member.greeting.trim();
    }

    return template.replaceAll(GREETING_NAME_TOKEN, member.nickName || '');
}

export const ORDER_CONFIRMATIONS = [
    'Ča čing',
    'Muhehe',
    'Díky. Přijďte zas',
    'Bude to stačit?',
    'testovací potvrzovací hláška šest',
] as const;

export function orderConfirmation(): string {
    return ORDER_CONFIRMATIONS[Math.floor(Math.random() * ORDER_CONFIRMATIONS.length)];
}

export function readPosConfig(raw: unknown): PosDeviceConfig {
    const config = (raw ?? {}) as Partial<PosDeviceConfig>;

    try {
        return configSchema.decode(config)
    } catch (e) {
        console.error("Failed to read pos configm using default", e)
        return configSchema.decode({})
    }
}

export function posConfigFromForm(formValue: FormDataEntryValue|string|null|undefined): PosDeviceConfig {
    try {
        return readPosConfig(JSON.parse(String(formValue ?? '{}')))
    } catch {
        return readPosConfig({})
    }
}

export const DEVICE_ID_HEADER = 'x-device-id';
