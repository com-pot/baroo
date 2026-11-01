import sharp from 'sharp';
import z from 'zod';
import * as m from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import { formatQuantity } from '$lib/bar/quantity';
import { SERVING_PRESETS, servingText } from '$lib/bar/servings';
import type { Measure } from '$lib/si/measure';
import { tapState } from './tapBoard.server';
import { directoryVersion, lookupCard, lookupDrink, type StoredImage } from './tapDirectory.server';
import { tapIdSchema, type TapScreens, type TapState } from './tapEvents';
import type { PendingOffer } from './tapHub.server';
import { imagesVersion, readImage } from './tapImages.server';

/**
 * TapTapper display screens, rendered by the venue server as raw RGB565 pixels (high byte first)
 * which the TapTapper streams to the panel as they are
 */

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;

/** How long a scan's screen stays before returning to idle */
export const SCREEN_HOLD_MS = 5000;
/** How long the TapTapper waits on a pending offer, the kiosk keeps it regardless */
export const OFFER_WAIT_MS = 15000;

const offerItemKey = z.string().regex(/^[a-z0-9-]{1,32}$/);
const cardSerial = z.string().regex(/^[0-9a-f]{4,40}$/);
const servingKey = z.string().regex(/^[0-9a-z_]{1,8}$/);
const quantity = z.coerce.number().min(0).max(100_000);

export const screenSpecSchema = z.discriminatedUnion('view', [
    z.object({
        view: z.literal('idle'),
        tap: tapIdSchema,
        item: offerItemKey.optional(),
        left: quantity.optional(),
        total: quantity.optional(),
    }),
    z.object({
        view: z.literal('unsealed'),
        tap: tapIdSchema,
        item: offerItemKey,
        /** Package label */
        label: z.string().max(40).optional(),
        left: quantity.optional(),
        total: quantity.optional(),
        warn: z.literal('no-staff').optional(),
    }),
    z.object({
        view: z.literal('offer'),
        tap: tapIdSchema,
        item: offerItemKey,
        serial: cardSerial,
        /** Buttons to draw, comma separated serving keys */
        sizes: z.string().regex(/^[0-9a-z_,]{0,40}$/).optional(),
        warn: z.literal('no-kiosk').optional(),
    }),
    z.object({
        view: z.literal('served'),
        tap: tapIdSchema,
        item: offerItemKey,
        serial: cardSerial,
        size: servingKey,
        left: quantity.optional(),
        total: quantity.optional(),
        warn: z.literal('no-kiosk').optional(),
    }),
    z.object({ view: z.literal('unset'), tap: tapIdSchema }),
]);

/** TapTapper's size buttons left to right, as the keypad has them */
const BUTTONS = [
    { size: '0_5', fill: '#dc2626', text: '#f9fafb' },
    { size: '0_3', fill: '#facc15', text: '#111827' },
];

export type ScreenSpec = z.input<typeof screenSpecSchema>;

/** TapTappers redraw only when the path changes, hence `v` - and the gauge's numbers in it */
export function screenPath(barSlug: string, spec: ScreenSpec): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(spec)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
    }
    query.set('v', `${directoryVersion()}.${imagesVersion()}`);
    return `/api/bars/${encodeURIComponent(barSlug)}/taps/screen?${query}`;
}

export function idleSpec(state: TapState): ScreenSpec {
    return {
        view: 'idle',
        tap: state.tap,
        item: state.offerItemKey ?? undefined,
        left: state.stock?.left,
        total: state.stock?.quantity,
    };
}

export async function idleScreen(ctx: Pick<App.Locals, "logger">, barSlug: string, tap: string): Promise<string> {
    return screenPath(barSlug, idleSpec(await tapState(ctx, barSlug, tap)));
}

export async function tapScreens(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    tap: string,
    now: ScreenSpec,
    hold = SCREEN_HOLD_MS,
): Promise<TapScreens> {
    return {
        screen: screenPath(barSlug, now),
        idle: await idleScreen(ctx, barSlug, tap),
        hold,
    };
}

/** The serving an offer got, over what is left on the tap after it */
export async function servedScreens(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    offer: Pick<PendingOffer, 'tap' | 'serialId' | 'offerItemKey'> & { variant: string },
    warn?: 'no-kiosk',
): Promise<TapScreens> {
    const state = await tapState(ctx, barSlug, offer.tap);
    const stock = state.offerItemKey === offer.offerItemKey ? state.stock : null;

    return tapScreens(ctx, barSlug, offer.tap, {
        view: 'served',
        tap: offer.tap,
        item: offer.offerItemKey,
        serial: offer.serialId,
        size: offer.variant,
        left: stock?.left,
        total: stock?.quantity,
        warn,
    });
}

/** Straight back to idle, for an offer nobody waits on any more */
export async function goneScreens(ctx: Pick<App.Locals, "logger">, barSlug: string, tap: string): Promise<TapScreens> {
    const idle = await idleScreen(ctx, barSlug, tap);
    return { screen: idle, idle, hold: 0 };
}

const CACHE_SIZE = 24;
const cache = new Map<string, Buffer>();

export async function renderScreen(ctx: Pick<App.Locals, "logger">, barSlug: string, spec: z.output<typeof screenSpecSchema>): Promise<Buffer> {
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
    track: '#374151',
    ok: '#16a34a',
    low: '#d97706',
    error: '#dc2626',
};

/** Below this share of the package left, the gauge turns amber - as the kiosk's stock board does */
const LOW_SHARE = 0.2;

type Layer = { input: Buffer; top: number; left: number };

async function draw(ctx: Pick<App.Locals, "logger">, barSlug: string, spec: z.output<typeof screenSpecSchema>): Promise<Buffer> {
    const svg: string[] = [];
    const layers: Layer[] = [];
    const tapLabel = m['baroo.bar.tap.title']({ tap: spec.tap });

    switch (spec.view) {
        case 'idle': {
            const drink = spec.item ? await lookupDrink(ctx, barSlug, spec.item) : null;
            svg.push(text(tapLabel, { y: 26, size: 16, fill: COLORS.muted }));

            if (!spec.item) {
                await picture(ctx, svg, layers, null, '?', { left: 30, top: 44, size: 180, shape: 'rounded' });
                svg.push(text(m['baroo.tap_screen.no_drink'](), { y: 262, size: 30, weight: 700, fill: COLORS.text }));
                svg.push(text(m['baroo.tap_screen.tap_package_tag'](), { y: 302, size: 16, fill: COLORS.muted }));
                break;
            }

            const name = drink?.name ?? spec.item;
            await picture(ctx, svg, layers, drink?.image ?? null, name, { left: 45, top: 40, size: 150, shape: 'rounded' });
            svg.push(text(name, { y: 224, size: 28, weight: 700, fill: COLORS.text }));
            if (spec.total) gauge(svg, 238, spec.left ?? 0, spec.total, drink?.measure);
            svg.push(text(m['baroo.tap_screen.tap_card'](), { y: 302, size: 16, fill: COLORS.muted }));
            break;
        }

        case 'unsealed': {
            const drink = await lookupDrink(ctx, barSlug, spec.item);
            const name = drink?.name ?? spec.item;

            if (spec.warn === 'no-staff') {
                svg.push(rect(0, 0, SCREEN_WIDTH, 40, COLORS.error));
                svg.push(text(m['baroo.tap_screen.not_unsealed'](), { y: 27, size: 18, weight: 700, fill: COLORS.text }));
            } else {
                svg.push(rect(0, 0, SCREEN_WIDTH, 40, COLORS.ok));
                svg.push(text(`✓ ${m['baroo.tap_screen.unsealed']()}`, { y: 27, size: 18, weight: 700, fill: COLORS.text }));
            }

            await picture(ctx, svg, layers, drink?.image ?? null, name, { left: 50, top: 48, size: 140, shape: 'rounded' });
            svg.push(text(name, { y: 220, size: 26, weight: 700, fill: COLORS.text }));

            if (spec.warn === 'no-staff') {
                svg.push(text(m['baroo.tap_screen.no_staff'](), { y: 262, size: 17, weight: 700, fill: COLORS.accent }));
                svg.push(text(m['baroo.tap_screen.no_staff_hint'](), { y: 290, size: 15, fill: COLORS.muted }));
                break;
            }

            if (spec.total) gauge(svg, 232, spec.left ?? spec.total, spec.total, drink?.measure);
            if (spec.label) svg.push(text(spec.label, { y: 292, size: 18, fill: COLORS.accent }));
            break;
        }

        case 'offer':
        case 'served': {
            const [holder, drink] = await Promise.all([
                lookupCard(ctx, barSlug, spec.serial),
                lookupDrink(ctx, barSlug, spec.item),
            ]);
            // Cards mapped on the tablet since the last pull are unknown here
            const name = holder?.nickName || m['baroo.tap_screen.greeting_unknown']();
            const drinkName = drink?.name ?? spec.item;

            svg.push(text(tapLabel, { y: 26, size: 16, fill: COLORS.muted }));

            if (spec.view === 'served') {
                await picture(ctx, svg, layers, holder?.image ?? null, holder?.nickName || '?', { left: 60, top: 38, size: 120, shape: 'circle' });
                svg.push(text(name, { y: 190, size: 30, weight: 700, fill: COLORS.text }));
                svg.push(text(drinkName, { y: 216, size: 20, fill: COLORS.accent }));

                if (spec.warn === 'no-kiosk') {
                    noKiosk(svg, 262);
                    break;
                }
                if (spec.total) gauge(svg, 226, spec.left ?? 0, spec.total, drink?.measure);
                svg.push(rect(0, 262, SCREEN_WIDTH, 58, COLORS.ok));
                svg.push(text(`✓ ${sizeName(spec.size)}`, { y: 300, size: 24, weight: 700, fill: COLORS.text }));
                break;
            }

            await picture(ctx, svg, layers, holder?.image ?? null, holder?.nickName || '?', { left: 45, top: 42, size: 150, shape: 'circle' });

            const sizes = (spec.sizes ?? '').split(',').filter(Boolean);
            if (!spec.warn && !sizes.length) {
                svg.push(text(name, { y: 236, size: 34, weight: 700, fill: COLORS.text }));
                svg.push(text(drinkName, { y: 270, size: 22, fill: COLORS.accent }));
                svg.push(text(m['baroo.tap_screen.pick_size'](), { y: 306, size: 15, fill: COLORS.muted }));
                break;
            }

            svg.push(text(name, { y: 228, size: 34, weight: 700, fill: COLORS.text }));
            svg.push(text(drinkName, { y: 258, size: 22, fill: COLORS.accent }));

            if (spec.warn === 'no-kiosk') {
                noKiosk(svg, 270);
                break;
            }

            // Each in its place above its key, the ones the item isn't offered in left out
            const width = (SCREEN_WIDTH - 36) / BUTTONS.length;
            BUTTONS.forEach((button, i) => {
                if (!sizes.includes(button.size)) return;

                const x = 12 + i * (width + 12);
                svg.push(`<rect x="${x}" y="274" width="${width}" height="38" rx="19" fill="${button.fill}"/>`);
                svg.push(text(sizeName(button.size, false), {
                    x: x + width / 2, y: 300, size: 22, weight: 700, fill: button.text, maxWidth: width - 16,
                }));
            });
            break;
        }

        case 'unset': {
            svg.push(text(tapLabel, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, null, '!', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(text(m['baroo.tap_screen.unset_title'](), { y: 236, size: 26, weight: 700, fill: COLORS.text }));
            svg.push(text(m['baroo.tap_screen.tap_package_tag'](), { y: 272, size: 18, fill: COLORS.accent }));
            break;
        }
    }

    const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`
        + rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLORS.background)
        + svg.join('')
        + '</svg>';

    return sharp(Buffer.from(frame)).composite(layers).removeAlpha().raw().toBuffer();
}

function noKiosk(svg: string[], top: number): void {
    svg.push(rect(0, top, SCREEN_WIDTH, SCREEN_HEIGHT - top, COLORS.error));
    svg.push(text(m['baroo.tap_screen.no_kiosk'](), { y: top + 21, size: 17, weight: 700, fill: COLORS.text }));
    svg.push(text(m['baroo.tap_screen.no_kiosk_hint'](), { y: top + 41, size: 14, fill: COLORS.text }));
}

/** What is left of the package, as a bar with "32,5 / 50 l" on it */
function gauge(svg: string[], top: number, left: number, total: number, measure: Measure = 'volume'): void {
    const x = 16;
    const width = SCREEN_WIDTH - 2 * x;
    const height = 26;
    const share = Math.max(0, Math.min(1, left / total));
    const fill = share <= 0 ? COLORS.error : share <= LOW_SHARE ? COLORS.low : COLORS.ok;

    svg.push(`<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="${height / 2}" fill="${COLORS.track}"/>`);
    if (share > 0) {
        // Never thinner than its rounded ends
        svg.push(`<rect x="${x}" y="${top}" width="${Math.max(height, width * share)}" height="${height}" rx="${height / 2}" fill="${fill}"/>`);
    }

    const amount = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: measure === 'count' ? 0 : 1 }).format(left);
    svg.push(text(`${amount} / ${formatQuantity(measure, total)}`, { y: top + 18, size: 15, weight: 700, fill: COLORS.text }));
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
            ctx.logger.warn(`[taps] unreadable picture: ${err instanceof Error ? err.message : err}`);
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
