import type { Bar } from '$lib/bar/BarModel';

export type PosDeviceKind = 'kiosk' | 'staff';

/** Themes a kiosk can be painted in. Only one for now; the field exists so adding a second is a data change. */
export const POS_THEMES = ['plain'] as const;
export type PosTheme = (typeof POS_THEMES)[number];

/**
 * Per-device kiosk settings, edited in backstage and carried to the tablet on every
 * snapshot pull. Every field has a default, so a device enrolled before this existed —
 * or one whose config row is empty — still boots.
 */
export type PosDeviceConfig = {
    theme: PosTheme;
    /** The lizard. Off for a bar that wants its kiosk to look like a till. */
    genZToy: boolean;
    /** Show the manual serial-id field, for tablets with no working NFC reader. */
    idInput: boolean;
    /**
     * What the kiosk says when a member checks in, with `{name}` standing in for their
     * nickname. Empty disables narration altogether — the kiosk stays silent and the
     * narrator is never even started.
     */
    greetingTemplate: string;
    /**
     * Let a member's own `greeting` replace the template. Moot while the template is
     * empty, since nothing is spoken at all then.
     */
    customGreetings: boolean;
};

/** The token `greetingTemplate` substitutes with the member's nickname. */
export const GREETING_NAME_TOKEN = '{name}';

export const DEFAULT_POS_CONFIG: PosDeviceConfig = {
    theme: 'plain',
    genZToy: true,
    idInput: false,
    greetingTemplate: `Ave ${GREETING_NAME_TOKEN}`,
    customGreetings: true,
};

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

    return {
        theme: POS_THEMES.includes(config.theme as PosTheme)
            ? (config.theme as PosTheme)
            : DEFAULT_POS_CONFIG.theme,
        genZToy: typeof config.genZToy === 'boolean' ? config.genZToy : DEFAULT_POS_CONFIG.genZToy,
        idInput: typeof config.idInput === 'boolean' ? config.idInput : DEFAULT_POS_CONFIG.idInput,
        greetingTemplate: typeof config.greetingTemplate === 'string'
            ? config.greetingTemplate
            : DEFAULT_POS_CONFIG.greetingTemplate,
        customGreetings: typeof config.customGreetings === 'boolean'
            ? config.customGreetings
            : DEFAULT_POS_CONFIG.customGreetings,
    };
}

/**
 * The config a device-settings form submits. Shared by backstage and enrolment so a
 * tablet is configured the same way whichever page it was set up from.
 */
export function posConfigFromForm(formData: FormData): PosDeviceConfig {
    const theme = formData.get('theme')?.toString() as PosTheme;

    return {
        theme: POS_THEMES.includes(theme) ? theme : DEFAULT_POS_CONFIG.theme,
        // Unchecked boxes simply aren't submitted.
        genZToy: formData.get('genZToy') === 'on',
        idInput: formData.get('idInput') === 'on',
        greetingTemplate: formData.get('greetingTemplate')?.toString().trim() ?? '',
        customGreetings: formData.get('customGreetings') === 'on',
    };
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
