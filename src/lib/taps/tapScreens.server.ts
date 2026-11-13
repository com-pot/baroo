import sharp from 'sharp';
import z from 'zod';
import * as m from '$lib/paraglide/messages.js';
import { formatQuantity } from '$lib/bar/quantity';
import { servingText } from '$lib/bar/servings';
import { type Measure } from '$lib/si/measure';
import { readTapConfig, tapModel } from './models';
import { buttonColor } from './models/tap-tapper_v1.0/palette';
import { tapLabel } from './barTap';
import type { TapSession } from './tapAuth.server';
import { tapState } from './tapBoard.server';
import { lookupCard, lookupDrink } from './tapLookup.server';
import { servingKey, type TapScreens, type TapState } from './tapEvents';
import type { PendingOffer } from './tapOffers.server';
import { imagesVersion, readImage, type StoredImage } from './tapImages.server';

/**
 * TapTapper display screens, rendered by the server as raw RGB565 pixels (high byte first)
 * which the TapTapper streams to the panel as they are
 */

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;

/** How long a scan's screen stays before returning to idle */
export const SCREEN_HOLD_MS = 5000;
/** How long the TapTapper waits on its buttons for a pending offer */
export const OFFER_WAIT_MS = 15000;

const offerItemKey = z.string().regex(/^[a-z0-9-]{1,32}$/);
const cardSerial = z.string().regex(/^[0-9a-f]{4,40}$/);
const quantity = z.coerce.number().min(0).max(100_000);

export const screenSpecSchema = z.discriminatedUnion('view', [
    z.object({
        view: z.literal('idle'),
        item: offerItemKey.optional(),
        left: quantity.optional(),
        total: quantity.optional(),
    }),
    z.object({
        view: z.literal('unsealed'),
        item: offerItemKey,
        /** Package label */
        label: z.string().max(40).optional(),
        left: quantity.optional(),
        total: quantity.optional(),
    }),
    z.object({
        view: z.literal('offer'),
        item: offerItemKey,
        serial: cardSerial,
        /** Serving keys the TapTapper's buttons answer, in their order, comma separated */
        variants: z.string().regex(/^[0-9a-z_,]{0,40}$/).optional(),
        warn: z.literal('no-sizes').optional(),
    }),
    z.object({
        view: z.literal('served'),
        item: offerItemKey,
        serial: cardSerial,
        /** Serving key */
        variant: servingKey,
        left: quantity.optional(),
        total: quantity.optional(),
    }),
    z.object({ view: z.literal('unset') }),
    z.object({ view: z.literal('unknown-card'), serial: cardSerial }),
]);

export type ScreenSpec = z.input<typeof screenSpecSchema>;

/** TapTappers redraw only when the path changes, hence `v` - and the gauge's numbers in it */
function screenPath(barSlug: string, spec: ScreenSpec): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(spec)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
    }
    query.set('v', String(imagesVersion()));
    return `/api/bars/${encodeURIComponent(barSlug)}/taps/screen?${query}`;
}

export function idleSpec(state: TapState): ScreenSpec {
    return {
        view: 'idle',
        item: state.offerItemKey ?? undefined,
        left: state.stock?.left,
        total: state.stock?.quantity,
    };
}

export async function idleScreen(session: TapSession): Promise<string> {
    return screenPath(session.tap.bar.slug, idleSpec(await tapState(session.pb, session.tap.bar.slug, session.ref)));
}

export async function tapScreens(session: TapSession, now: ScreenSpec, hold = SCREEN_HOLD_MS): Promise<TapScreens> {
    return {
        screen: screenPath(session.tap.bar.slug, now),
        idle: await idleScreen(session),
        hold,
    };
}

/** The serving an offer got, over what is left on the tap after it */
export async function servedScreens(
    session: TapSession,
    offer: Pick<PendingOffer, 'serialId' | 'offerItemKey'> & { variant: string },
): Promise<TapScreens> {
    const state = await tapState(session.pb, session.tap.bar.slug, session.ref);
    const stock = state.offerItemKey === offer.offerItemKey ? state.stock : null;

    return tapScreens(session, {
        view: 'served',
        item: offer.offerItemKey,
        serial: offer.serialId,
        variant: offer.variant,
        left: stock?.left,
        total: stock?.quantity,
    });
}

/** Straight back to idle, for an offer nobody waits on any more */
export async function goneScreens(session: TapSession): Promise<TapScreens> {
    const idle = await idleScreen(session);
    return { screen: idle, idle, hold: 0 };
}

/** Colors of the tap's size buttons, in their order */
export function tapButtons(tap: TapSession["tap"]): number[] {
    const model = tapModel(tap.model);
    if (!model) return [];

    const { buttons } = readTapConfig(model, tap.config) as { buttons?: { color: number }[] };
    return (buttons ?? []).map((button) => button.color);
}

const CACHE_SIZE = 24;
const cache = new Map<string, Buffer>();

/** What drawing a screen needs of the request */
type ScreenCtx = Pick<App.Locals, "logger" | "i18n">;

export async function renderScreen(ctx: ScreenCtx, session: TapSession, spec: z.output<typeof screenSpecSchema>): Promise<Buffer> {
    const key = [
        session.tap.id,
        tapLabel(session.tap),
        tapButtons(session.tap).join(','),
        ctx.i18n.locale,
        imagesVersion(),
        JSON.stringify(spec),
    ].join('|');

    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }

    const pixels = toRgb565(await draw(ctx, session, spec));
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

async function draw(ctx: ScreenCtx, session: TapSession, spec: z.output<typeof screenSpecSchema>): Promise<Buffer> {
    const svg: string[] = [];
    const layers: Layer[] = [];
    const { pb } = session;
    const barSlug = session.tap.bar.slug;
    const label = tapLabel(session.tap);

    switch (spec.view) {
        case 'idle': {
            const drink = spec.item ? await lookupDrink(pb, barSlug, spec.item) : null;
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));

            if (!spec.item) {
                await picture(ctx, svg, layers, null, '?', { left: 30, top: 44, size: 180, shape: 'rounded' });
                svg.push(text(m['baroo.tap_screen.no_drink']({}, { locale: ctx.i18n.locale }), { y: 262, size: 30, weight: 700, fill: COLORS.text }));
                svg.push(text(m['baroo.tap_screen.tap_package_tag']({}, { locale: ctx.i18n.locale }), { y: 302, size: 16, fill: COLORS.muted }));
                break;
            }

            const name = drink?.name ?? spec.item;
            await picture(ctx, svg, layers, drink?.image ?? null, name, { left: 45, top: 40, size: 150, shape: 'rounded' });
            svg.push(text(name, { y: 224, size: 28, weight: 700, fill: COLORS.text }));
            if (spec.total) gauge(ctx, svg, 238, spec.left ?? 0, spec.total, drink?.measure);
            svg.push(text(m['baroo.tap_screen.tap_card']({}, { locale: ctx.i18n.locale }), { y: 302, size: 16, fill: COLORS.muted }));
            break;
        }

        case 'unsealed': {
            const drink = await lookupDrink(pb, barSlug, spec.item);
            const name = drink?.name ?? spec.item;

            svg.push(rect(0, 0, SCREEN_WIDTH, 40, COLORS.ok));
            svg.push(text(`✓ ${m['baroo.tap_screen.unsealed']({}, { locale: ctx.i18n.locale })}`, { y: 27, size: 18, weight: 700, fill: COLORS.text }));

            await picture(ctx, svg, layers, drink?.image ?? null, name, { left: 50, top: 48, size: 140, shape: 'rounded' });
            svg.push(text(name, { y: 220, size: 26, weight: 700, fill: COLORS.text }));

            if (spec.total) gauge(ctx, svg, 232, spec.left ?? spec.total, spec.total, drink?.measure);
            if (spec.label) svg.push(text(spec.label, { y: 292, size: 18, fill: COLORS.accent }));
            break;
        }

        case 'offer':
        case 'served': {
            const [holder, drink] = await Promise.all([
                lookupCard(pb, barSlug, spec.serial),
                lookupDrink(pb, barSlug, spec.item),
            ]);
            const name = holder?.nickName || m['baroo.tap_screen.greeting_unknown']({}, { locale: ctx.i18n.locale });
            const drinkName = drink?.name ?? spec.item;

            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));

            if (spec.view === 'served') {
                await picture(ctx, svg, layers, holder?.image ?? null, holder?.nickName || '?', { left: 60, top: 38, size: 120, shape: 'circle' });
                svg.push(text(name, { y: 190, size: 30, weight: 700, fill: COLORS.text }));
                svg.push(text(drinkName, { y: 216, size: 20, fill: COLORS.accent }));

                if (spec.total) gauge(ctx, svg, 226, spec.left ?? 0, spec.total, drink?.measure);

                const serving = drink?.servings.find((candidate) => candidate.key === spec.variant);
                const served = serving && drink
                    ? `${ctx.i18n.pick(serving.name) ?? serving.label} ${servingText(serving, drink.measure, ctx.i18n.locale)}`
                    : spec.variant;
                svg.push(rect(0, 262, SCREEN_WIDTH, 58, COLORS.ok));
                svg.push(text(`✓ ${served}`, { y: 300, size: 24, weight: 700, fill: COLORS.text }));
                break;
            }

            await picture(ctx, svg, layers, holder?.image ?? null, holder?.nickName || '?', { left: 45, top: 42, size: 150, shape: 'circle' });

            const variants = (spec.variants ?? '').split(',').filter(Boolean);
            svg.push(text(name, { y: 228, size: 34, weight: 700, fill: COLORS.text }));
            svg.push(text(drinkName, { y: 258, size: 22, fill: COLORS.accent }));

            if (spec.warn === 'no-sizes') {
                noSizes(ctx, svg, 270);
                break;
            }

            // Each in its place above its key, in the key's color
            const buttons = tapButtons(session.tap);
            const gap = 12;
            const width = (SCREEN_WIDTH - gap * (buttons.length + 1)) / Math.max(buttons.length, 1);
            buttons.forEach((colorIndex, i) => {
                const variant = variants[i];
                if (!variant) return;
                const serving = drink?.servings.find((candidate) => candidate.key === variant);

                const color = buttonColor(colorIndex);
                const x = gap + i * (width + gap);
                svg.push(`<rect x="${x}" y="274" width="${width}" height="38" rx="19" fill="${color.fill}"/>`);
                svg.push(text(ctx.i18n.pick(serving?.name) ?? variant, {
                    x: x + width / 2, y: 300, size: 22, weight: 700, fill: color.text, maxWidth: width - 16,
                }));
            });
            break;
        }

        case 'unset': {
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, null, '!', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(text(m['baroo.tap_screen.unset_title']({}, { locale: ctx.i18n.locale }), { y: 236, size: 26, weight: 700, fill: COLORS.text }));
            svg.push(text(m['baroo.tap_screen.tap_package_tag']({}, { locale: ctx.i18n.locale }), { y: 272, size: 18, fill: COLORS.accent }));
            break;
        }

        case 'unknown-card': {
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, null, '?', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(text(m['baroo.tap_screen.unknown_card']({}, { locale: ctx.i18n.locale }), { y: 236, size: 26, weight: 700, fill: COLORS.text }));
            svg.push(text(spec.serial, { y: 272, size: 18, fill: COLORS.accent }));
            break;
        }
    }

    const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`
        + rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLORS.background)
        + svg.join('')
        + '</svg>';

    return sharp(Buffer.from(frame)).composite(layers).removeAlpha().raw().toBuffer();
}

function noSizes(ctx: ScreenCtx, svg: string[], top: number): void {
    svg.push(rect(0, top, SCREEN_WIDTH, SCREEN_HEIGHT - top, COLORS.error));
    svg.push(text(m['baroo.tap_screen.no_sizes']({}, { locale: ctx.i18n.locale }), { y: top + 21, size: 17, weight: 700, fill: COLORS.text }));
    svg.push(text(m['baroo.tap_screen.no_sizes_hint']({}, { locale: ctx.i18n.locale }), { y: top + 41, size: 14, fill: COLORS.text }));
}

/** What is left of the package, as a bar with "32,5 / 50 l" on it */
function gauge(ctx: ScreenCtx, svg: string[], top: number, left: number, total: number, measure: Measure = 'volume'): void {
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

    svg.push(text(
        `${formatQuantity(measure, left, ctx.i18n.locale)} / ${formatQuantity(measure, total, ctx.i18n.locale)}`,
        { y: top + 18, size: 15, weight: 700, fill: COLORS.text },
    ));
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
