import sharp from 'sharp';
import z from 'zod';
import * as m from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import { SERVING_PRESETS, servingText } from '$lib/bar/servings';
import { directoryVersion, lookupCard, lookupDrink, type StoredImage } from './spigotDirectory.server';
import type { SpigotScreens } from './spigotEvents';
import { imagesVersion, readImage } from './spigotImages.server';

/**
 * Station display screens, rendered by the venue server as raw RGB565 pixels (high byte first)
 * which the station streams to the panel as they are
 */

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;

/** How long a scan's screen stays before returning to idle */
export const SCREEN_HOLD_MS = 5000;
/** How long the station's size buttons wait, the kiosk keeps the pour regardless */
export const SIZE_WAIT_MS = 15000;

const spigotId = z.string().regex(/^[a-z0-9-]{1,16}$/);
const beverageKey = z.string().regex(/^[a-z0-9-]{1,32}$/);
const cardSerial = z.string().regex(/^[0-9a-f]{4,40}$/);

export const screenSpecSchema = z.discriminatedUnion('view', [
    z.object({ view: z.enum(['idle', 'assigned']), spigot: spigotId, beverage: beverageKey.optional() }),
    z.object({
        view: z.literal('pour'),
        spigot: spigotId,
        beverage: beverageKey,
        serial: cardSerial,
        pick: z.literal('buttons').optional(),
        warn: z.literal('no-kiosk').optional(),
    }),
    z.object({
        view: z.literal('served'),
        spigot: spigotId,
        beverage: beverageKey,
        serial: cardSerial,
        size: z.string().regex(/^[0-9a-z_]{1,8}$/),
        warn: z.literal('no-kiosk').optional(),
    }),
    z.object({ view: z.literal('unset'), spigot: spigotId }),
]);

/** Station's size buttons left to right, must match `SIZE_BUTTONS` in config.py */
const BUTTONS = [
    { size: '0_5', fill: '#dc2626', text: '#f9fafb' },
    { size: '0_3', fill: '#facc15', text: '#111827' },
];

export type ScreenSpec = z.infer<typeof screenSpecSchema>;

/** Stations redraw only when the path changes, hence `v` */
export function screenPath(barSlug: string, spec: ScreenSpec): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(spec)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
    }
    query.set('v', `${directoryVersion()}.${imagesVersion()}`);
    return `/api/bars/${encodeURIComponent(barSlug)}/spigots/screen?${query}`;
}

export function stationScreens(
    barSlug: string,
    spigot: string,
    beverage: string | null,
    now: ScreenSpec,
    hold = SCREEN_HOLD_MS,
): SpigotScreens {
    return {
        screen: screenPath(barSlug, now),
        idle: screenPath(barSlug, { view: 'idle', spigot, beverage: beverage ?? undefined }),
        hold,
    };
}

const CACHE_SIZE = 24;
const cache = new Map<string, Buffer>();

export async function renderScreen(ctx: Pick<App.Locals, "logger">, barSlug: string, spec: ScreenSpec): Promise<Buffer> {
    const key = [barSlug, getLocale(), directoryVersion(), imagesVersion(), JSON.stringify(spec)].join('|');

    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }

    const pixels = toRgb565(await draw(ctx, barSlug, spec));
    cache.set(key, pixels);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);

    return pixels;
}

const FONT = 'DejaVu Sans, Segoe UI, Arial, sans-serif';
const COLORS = {
    background: '#111827',
    text: '#f9fafb',
    muted: '#9ca3af',
    accent: '#fbbf24',
    placeholder: '#f59e0b',
    ok: '#16a34a',
    error: '#dc2626',
};

type Layer = { input: Buffer; top: number; left: number };

async function draw(ctx: Pick<App.Locals, "logger">, barSlug: string, spec: ScreenSpec): Promise<Buffer> {
    const svg: string[] = [];
    const layers: Layer[] = [];
    const spigotLabel = m['baroo.bar.spigot.title']({ spigot: spec.spigot });

    switch (spec.view) {
        case 'idle':
        case 'assigned': {
            const drink = spec.beverage ? await lookupDrink(ctx, barSlug, spec.beverage) : null;
            const name = spec.beverage
                ? drink?.name ?? spec.beverage
                : m['baroo.spigot_screen.no_drink']();

            if (spec.view === 'assigned') {
                svg.push(rect(0, 0, SCREEN_WIDTH, 40, COLORS.ok));
                svg.push(text(`✓ ${m['baroo.spigot_screen.assigned']()}`, { y: 27, size: 18, weight: 700, fill: COLORS.text }));
            } else {
                svg.push(text(spigotLabel, { y: 26, size: 16, fill: COLORS.muted }));
            }

            await picture(ctx, svg, layers, drink?.image ?? null, spec.beverage ? name : '?', { left: 30, top: 44, size: 180, shape: 'rounded' });
            svg.push(text(name, { y: 262, size: 30, weight: 700, fill: COLORS.text }));
            svg.push(text(
                spec.beverage ? m['baroo.spigot_screen.tap_card']() : m['baroo.spigot_screen.tap_drink_tag'](),
                { y: 302, size: 16, fill: COLORS.muted },
            ));
            break;
        }

        case 'pour':
        case 'served': {
            const [holder, drink] = await Promise.all([
                lookupCard(ctx, barSlug, spec.serial),
                lookupDrink(ctx, barSlug, spec.beverage),
            ]);
            // Cards mapped on the tablet since the last pull are unknown here
            const name = holder?.nickName || m['baroo.spigot_screen.greeting_unknown']();
            const drinkName = drink?.name ?? spec.beverage;

            svg.push(text(spigotLabel, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, holder?.image ?? null, holder?.nickName || '?', { left: 45, top: 42, size: 150, shape: 'circle' });

            if (spec.view === 'pour' && !spec.warn && !spec.pick) {
                svg.push(text(name, { y: 236, size: 34, weight: 700, fill: COLORS.text }));
                svg.push(text(drinkName, { y: 270, size: 22, fill: COLORS.accent }));
                svg.push(text(m['baroo.spigot_screen.pick_size'](), { y: 306, size: 15, fill: COLORS.muted }));
                break;
            }

            svg.push(text(name, { y: 228, size: 34, weight: 700, fill: COLORS.text }));
            svg.push(text(drinkName, { y: 258, size: 22, fill: COLORS.accent }));

            if (spec.warn === 'no-kiosk') {
                svg.push(rect(0, 270, SCREEN_WIDTH, 50, COLORS.error));
                svg.push(text(m['baroo.spigot_screen.no_kiosk'](), { y: 291, size: 17, weight: 700, fill: COLORS.text }));
                svg.push(text(m['baroo.spigot_screen.no_kiosk_hint'](), { y: 311, size: 14, fill: COLORS.text }));
            } else if (spec.view === 'served') {
                svg.push(rect(0, 270, SCREEN_WIDTH, 50, COLORS.ok));
                svg.push(text(`✓ ${sizeName(spec.size)}`, { y: 303, size: 24, weight: 700, fill: COLORS.text }));
            } else {
                const width = (SCREEN_WIDTH - 36) / BUTTONS.length;
                BUTTONS.forEach((button, i) => {
                    const x = 12 + i * (width + 12);
                    svg.push(`<rect x="${x}" y="274" width="${width}" height="38" rx="19" fill="${button.fill}"/>`);
                    svg.push(text(sizeName(button.size, false), {
                        x: x + width / 2, y: 300, size: 22, weight: 700, fill: button.text, maxWidth: width - 16,
                    }));
                });
            }
            break;
        }

        case 'unset': {
            svg.push(text(spigotLabel, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, null, '!', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(text(m['baroo.spigot_screen.unset_title'](), { y: 236, size: 26, weight: 700, fill: COLORS.text }));
            svg.push(text(m['baroo.spigot_screen.tap_drink_tag'](), { y: 272, size: 18, fill: COLORS.accent }));
            break;
        }
    }

    const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`
        + rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLORS.background)
        + svg.join('')
        + '</svg>';

    return sharp(Buffer.from(frame)).composite(layers).removeAlpha().raw().toBuffer();
}

/** Falls back to the name's initial on a colored shape */
async function picture(
    ctx: Pick<App.Locals, "logger">,
    svg: string[],
    layers: Layer[],
    image: StoredImage | null,
    name: string,
    box: { left: number; top: number; size: number; shape: 'circle' | 'rounded' },
): Promise<void> {
    const bytes = image ? await readImage(ctx, image) : null;

    if (bytes) {
        try {
            layers.push({ input: await cutOut(bytes, box.size, box.shape), top: box.top, left: box.left });
            return;
        } catch (err) {
            ctx.logger.warn(`[spigots] unreadable picture: ${err instanceof Error ? err.message : err}`);
        }
    }

    const { left, top, size } = box;
    svg.push(box.shape === 'circle'
        ? `<circle cx="${left + size / 2}" cy="${top + size / 2}" r="${size / 2}" fill="${COLORS.placeholder}"/>`
        : `<rect x="${left}" y="${top}" width="${size}" height="${size}" rx="18" fill="${COLORS.placeholder}"/>`);

    const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? '?';
    svg.push(`<text x="${left + size / 2}" y="${top + size / 2}" dy="0.35em" font-family="${FONT}" font-size="${Math.round(size * 0.5)}" font-weight="700" fill="${COLORS.background}" text-anchor="middle">${escapeXml(initial)}</text>`);
}

async function cutOut(bytes: Buffer, size: number, shape: 'circle' | 'rounded'): Promise<Buffer> {
    const mask = shape === 'circle'
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="18"/></svg>`;

    return sharp(bytes)
        .rotate()
        .resize(size, size, { fit: 'cover' })
        .composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
        .png()
        .toBuffer();
}

/** e.g.: "Malé 0.3l" */
function sizeName(key: string, withAmount = true): string {
    for (const preset of SERVING_PRESETS.items) {
        const serving = preset.servings.find(candidate => candidate.key === key);
        if (!serving) continue;

        const names: Record<string, string> = serving.name;
        const name = names[getLocale()] ?? names.cs;
        return withAmount ? `${name} ${servingText(serving, preset.measure)}` : name;
    }
    return key;
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
}

/** Line centered on `x`, shrunk to fit by estimated glyph widths and clipped as a last resort */
function text(
    content: string,
    style: { x?: number; y: number; size: number; fill: string; weight?: 400 | 700; maxWidth?: number },
): string {
    const { x = SCREEN_WIDTH / 2, y, fill, weight = 400, maxWidth = SCREEN_WIDTH - 20 } = style;
    const perChar = weight === 700 ? 0.62 : 0.56;
    const chars = [...content];

    const size = Math.max(12, Math.min(style.size, Math.floor(maxWidth / (Math.max(chars.length, 1) * perChar))));
    const fits = Math.floor(maxWidth / (size * perChar));
    const shown = chars.length > fits ? chars.slice(0, Math.max(fits - 1, 1)).join('') + '…' : content;

    return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${escapeXml(shown)}</text>`;
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function toRgb565(rgb: Buffer): Buffer {
    const out = Buffer.alloc((rgb.length / 3) * 2);
    for (let i = 0, o = 0; i < rgb.length; i += 3, o += 2) {
        const value = ((rgb[i] & 0xf8) << 8) | ((rgb[i + 1] & 0xfc) << 3) | (rgb[i + 2] >> 3);
        out[o] = value >> 8;
        out[o + 1] = value & 0xff;
    }
    return out;
}
