import type { Bar } from '$lib/bar/BarModel';
import z from 'zod';

export type PosDeviceKind = 'kiosk' | 'staff';
export const GREETING_NAME_TOKEN = '{name}';

export const configSchema = z.object({
    theme: z.enum(['plain']).default("plain"),
    genZToy: z.boolean().default(false),
    idInput: z.boolean().default(false),

    greetingTemplate: z.string().default("Ave, {name}"),
    customGreetings: z.boolean().default(true),
})

export type PosDeviceConfig = z.infer<typeof configSchema>

/**
 * The line to speak when `member` checks in, or `null` when the kiosk should stay quiet.
 * A member's own greeting only wins if the device allows it — and never when narration
 * is off, because then there is nothing to override.
 */
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

/**
 * What the kiosk says once an order is safely in the outbox. Fixed lines rather than a
 * config field: the greeting is the part a bar wants to make its own, while this is the
 * house's own patter — and a till that says the same thing every round gets tuned out,
 * so the line is drawn at random.
 */
export const ORDER_CONFIRMATIONS = [
    'Ča čing',
    'Muhehe',
    'Díky. Přijďte zas',
    'Bude to stačit?',
    'testovací potvrzovací hláška šest',
] as const;

/** One of {@link ORDER_CONFIRMATIONS}, picked at random. */
export function orderConfirmation(): string {
    return ORDER_CONFIRMATIONS[Math.floor(Math.random() * ORDER_CONFIRMATIONS.length)];
}

/** Normalises whatever the `config` JSON column holds into a complete config. */
export function readPosConfig(raw: unknown): PosDeviceConfig {
    const config = (raw ?? {}) as Partial<PosDeviceConfig>;

    return configSchema.decode(config)
}

/**
 * The config a device-settings form submits, carried as one JSON field rather than as
 * loose inputs.
 *
 * Loose inputs cannot express this form. An unchecked checkbox is simply absent from a
 * `FormData`, which is indistinguishable from a field the form never had — so the three
 * toggles would read as "unset" and fall back to their defaults, which for
 * `customGreetings` means on. The fields are edited as an object either way; this just
 * sends that object.
 */
export function posConfigFromForm(formData: FormData): PosDeviceConfig {
    try {
        return readPosConfig(JSON.parse(String(formData.get('config') ?? '{}')))
    } catch {
        // A malformed field is a broken client, not a request to wipe the settings — but
        // there is nothing here to merge, so the defaults are all that is left to give.
        return readPosConfig({})
    }
}

/** An enrolled tablet. `bar` is the id; `expand.bar` is present when expanded. */
export type PosDevice = {
    id: string;
    label: string;
    bar: string;
    kind: PosDeviceKind;
    active: boolean;
    lastSeen?: string;
    config?: Partial<PosDeviceConfig> | null;
    /** The barman the tablet acts as — the one who issued its pairing code. */
    enrolledBy?: string;
    expand?: { bar?: Bar; enrolledBy?: { name?: string; email?: string } };
};

/** Names the tablet; the bearer token proves it may act. Both are required. */
export const DEVICE_ID_HEADER = 'x-device-id';
