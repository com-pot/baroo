import z from 'zod';
import template from './tapConfig.template.py?raw';
import { BUTTON_PALETTE } from '$lib/taps/models/palette';
import { pyLiteral } from '$lib/serial/platform';
import type { TapConfigContext, TapModel, TapRuntime } from '$lib/taps/models/tapModel';

const gpio = z.number().int().min(0).max(28);

export const configSchema = z.object({
    server: z.string().min(1).default('http://192.168.1.10:3000'),
    wifiNetwork: z.string().default('').meta({ optionsFrom: 'wifiNetworks' }),

    buzzerPin: gpio.nullable().default(15),
    buzzerActiveLow: z.boolean().default(false),

    display: z.boolean().default(true),
    displayMadctl: z.enum(['0x48', '0x40', '0x88', '0x08']).default('0x48').meta({
        optionsI18nPrefix: 'baroo.tap.config.displayMadctl.value.',
    }),

    buttons: z.array(z.object({
        pin: gpio.default(0),
        /** Index into the palette */
        color: z.number().int().min(0).max(BUTTON_PALETTE.length - 1).default(0).meta({
            palette: BUTTON_PALETTE,
            optionsI18nPrefix: 'color.',
        }),
    })).max(4).default([
        { pin: 1, color: 0 },
        { pin: 0, color: 1 },
    ]),

    watchdog: z.boolean().default(true),
});

export type TapTapperConfig = z.infer<typeof configSchema>;

function materialize(config: TapTapperConfig, ctx: TapConfigContext): string {
    const values: Record<string, string> = {
        TAP_LABEL: ctx.label,
        WIFI_SSID: pyLiteral(ctx.wifi?.ssid ?? ''),
        WIFI_PASSWORD: pyLiteral(ctx.wifi?.password ?? ''),
        WIFI_COUNTRY: pyLiteral(ctx.wifi?.country || null),
        SERVER: pyLiteral(config.server),
        BAR: pyLiteral(ctx.barSlug),
        IDLE_SCREEN: pyLiteral(`${config.server.replace(/\/+$/, '')}/api/bars/${encodeURIComponent(ctx.barSlug)}/taps/screen`),
        TAP_TOKEN: pyLiteral(ctx.token),
        TOKEN_VALID_THROUGH: ctx.validThrough,
        BUZZER_PIN: pyLiteral(config.buzzerPin),
        BUZZER_ACTIVE_LOW: pyLiteral(config.buzzerActiveLow),
        DISPLAY: pyLiteral(config.display),
        // Validated by the enum, readable as hex
        DISPLAY_MADCTL: config.displayMadctl,
        BUTTONS: pyLiteral(config.buttons.map(({ pin, color }) => ({ pin, color }))),
        WATCHDOG: pyLiteral(config.watchdog),
    };

    return template.replaceAll(/\{\{([A-Z_]+)\}\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}

const runtimeSources = import.meta.glob<string>('../runtime/*.py', { query: '?raw', import: 'default' });

async function runtime(configFile: string): Promise<TapRuntime> {
    const program: TapRuntime["files"] = await Promise.all(
        Object.entries(runtimeSources)
            .map(async ([path, load]) => [path.slice(path.lastIndexOf('/') + 1), await load()])
    )
    program.push(['config.py', configFile])

    return {
        files: program,
        prerequisites: ['lib/mfrc522.py'],
    };
}

export const tapTapperV1: TapModel<typeof configSchema> = {
    key: 'tap-tapper_v1.0',
    configSchema,
    materialize,
    runtime,
};
