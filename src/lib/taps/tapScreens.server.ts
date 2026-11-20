import sharp from 'sharp';
import z from 'zod';
import { env } from '$env/dynamic/private';
import * as m from '$lib/paraglide/messages.js';
import { formatQuantity } from '$lib/bar/quantity';
import { servingText } from '$lib/bar/servings';
import { type Measure } from '$lib/si/measure';
import { tagSerialSchema } from '$lib/bar/tags';
import { readTapConfig, tapModel } from './models';
import { buttonColor } from '$lib/taps/models/palette';
import { tapLabel } from './barTap';
import type { TapSession } from './tapAuth.server';
import { tapState } from './tapBoard.server';
import { barMemberImage, lookupCard, offerItemImageRef } from './tapLookup.server';
import { servingKey, type TapScreen } from './tapEvents';
import type { PendingOffer } from './tapOffers.server';
import { toIsoDate, type PbImageRef } from '$lib/pocketbase';
import { getBarOfferItem, roundQuantity } from '$lib/bar/stats/barOfferItems';

/**
 * TapTapper display screens, rendered by the server as raw RGB565 pixels (high byte first)
 * which the TapTapper streams to the panel as they are
 */

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;

export const SCREEN_HOLD_MS = 5000;
/** The confirmed serving, just long enough to read before the idle screen shows what is left */
const SERVED_HOLD_MS = 1500;

const offerItemKey = z.string().regex(/^[a-z0-9-]{1,32}$/);
const quantity = z.coerce.number().min(0).max(100_000);

/** Screens in reply to what was just done at the tap, all they show is in their path */
export const screenSpecSchema = z.discriminatedUnion('view', [
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
        serial: tagSerialSchema,
        /** Serving keys the TapTapper's buttons answer, in their order, comma separated */
        variants: z.string().regex(/^[0-9a-z_,]{0,40}$/).optional(),
    }),
    z.object({
        view: z.literal('served'),
        item: offerItemKey,
        serial: tagSerialSchema,
        /** Serving key */
        variant: servingKey,
    }),
    z.object({ view: z.literal('unknown-card'), serial: tagSerialSchema }),
    z.object({
        view: z.literal('error'),
        text: z.string().min(1).max(60),
        hint: z.string().max(60).optional(),
    }),
]);

export type ScreenSpec = z.input<typeof screenSpecSchema>;

function screenPath(barSlug: string, spec: ScreenSpec): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(spec)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
    }
    return `/api/bars/${encodeURIComponent(barSlug)}/taps/screen?${query}`;
}

export function tapScreen(session: TapSession, spec: ScreenSpec, hold = SCREEN_HOLD_MS): TapScreen {
    return { path: screenPath(session.tap.bar.slug, spec), hold };
}

export function servedScreen(
    session: TapSession,
    offer: Pick<PendingOffer, 'serialId' | 'offerItemKey'> & { variant: string },
): TapScreen {
    return tapScreen(session, {
        view: 'served',
        item: offer.offerItemKey,
        serial: offer.serialId,
        variant: offer.variant,
    }, SERVED_HOLD_MS);
}

/** The tap as it is now - what it pours and how much is left */
type IdleScreen = { view: 'idle'; item: string | null; left?: number; total?: number };

export async function idleScreen(session: TapSession): Promise<IdleScreen> {
    const state = await tapState(session.pb, session.tap.bar.slug, session.ref);
    return { view: 'idle', item: state.offerItemKey, left: state.stock?.left, total: state.stock?.quantity };
}

/**
 * When the idle screen last changed, as the latest of what it shows: unseals and flushes on
 * the tap, orders poured from it, and the drink on it. `null` for a tap that never had any.
 *
 * All of them are filed by the server or PocketBase - from the tap, a kiosk or backstage - so
 * their times only ever move on, and a TapTapper asking with the one it has is told whether
 * its panel is still right. The tap's name is not among them, a renamed tap shows it once
 * something else changes or it reboots.
 */
export async function idleScreenUpdatedAt(session: TapSession): Promise<string | null> {
    const { pb, tap, ref } = session;
    const latest = { sort: '-updated', fields: 'updated' };

    const [events, orders, onTap] = await Promise.all([
        pb.collection<{ created: string }>('events').getList(1, 1, {
            filter: pb.filter('target = {:target} && (type = "unseal" || type = "flush") && data.tap = {:tap}', {
                target: `bar:${tap.bar.slug}`,
                tap: ref,
            }),
            sort: '-created',
            fields: 'created',
        }),
        pb.collection<{ updated: string }>('bar_order_items').getList(1, 1, {
            filter: pb.filter('tap = {:tap}', { tap: tap.id }),
            ...latest,
        }),
        pb.collection<{ expand?: { offerItem?: { updated: string } } }>('bar_offer_packages').getList(1, 1, {
            filter: pb.filter('tap = {:tap} && unsealedAt != "" && flushedAt = ""', { tap: tap.id }),
            sort: '-unsealedAt',
            expand: 'offerItem',
            fields: 'expand.offerItem.updated',
        }),
    ]);

    const times = [
        events.items[0]?.created,
        orders.items[0]?.updated,
        onTap.items[0]?.expand?.offerItem?.updated,
    ].map((at) => toIsoDate(at)).filter(Boolean);

    return times.sort().at(-1) ?? null;
}

/** Colors of the tap's size buttons, in their order */
export function tapButtons(tap: TapSession["tap"]): number[] {
    const model = tapModel(tap.model);
    if (!model) return [];

    const { buttons } = readTapConfig(model, tap.config) as { buttons?: { color: number }[] };
    return (buttons ?? []).map((button) => button.color);
}

/** What the tap's gauge counts: what is left of the package, or what got poured from it */
export type GaugeMode = 'left' | 'poured';

export function tapGauge(tap: TapSession["tap"]): GaugeMode {
    const model = tapModel(tap.model);
    if (!model) return 'left';

    const { gauge } = readTapConfig(model, tap.config) as { gauge?: GaugeMode };
    return gauge === 'poured' ? 'poured' : 'left';
}

/**
 * ETag of the idle screen: when it last changed, and how its gauge counts - so a TapTapper
 * redraws on its next check once backstage switches the gauge
 */
export async function idleScreenEtag(session: TapSession): Promise<string> {
    return `"${(await idleScreenUpdatedAt(session)) ?? 'never'}/${tapGauge(session.tap)}"`;
}

/** What drawing a screen needs of the request */
type ScreenCtx = Pick<App.Locals, "logger" | "i18n">;

/** Drawn afresh every time: TapTappers ask for a screen only once it changed */
export async function renderScreen(ctx: ScreenCtx, session: TapSession, spec: z.output<typeof screenSpecSchema> | IdleScreen): Promise<Buffer> {
    return toRgb565(await draw(ctx, session, spec));
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

async function draw(ctx: ScreenCtx, session: TapSession, spec: z.output<typeof screenSpecSchema> | IdleScreen): Promise<Buffer> {
    const svg: string[] = [];
    const layers: Layer[] = [];
    const { pb } = session;
    const barSlug = session.tap.bar.slug;
    const label = tapLabel(session.tap);
    const gaugeMode = tapGauge(session.tap);

    switch (spec.view) {
        case 'idle': {
            const drink = spec.item ? await getBarOfferItem(pb, barSlug, spec.item) : null;
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));

            if (!spec.item) {
                await picture(ctx, svg, layers, null, '?', { left: 30, top: 44, size: 180, shape: 'rounded' });
                svg.push(text(m['baroo.tap_screen.no_drink']({}, { locale: ctx.i18n.locale }), { y: 262, size: 30, weight: 700, fill: COLORS.text }));
                svg.push(text(m['baroo.tap_screen.tap_package_tag']({}, { locale: ctx.i18n.locale }), { y: 302, size: 16, fill: COLORS.muted }));
                break;
            }

            const name = drink?.name ?? spec.item;
            await picture(ctx, svg, layers, offerItemImageRef(drink), name, { left: 45, top: 40, size: 150, shape: 'rounded' });
            svg.push(text(name, { y: 224, size: 28, weight: 700, fill: COLORS.text }));
            if (spec.total) gauge(ctx, svg, 238, gaugeMode, spec.left ?? 0, spec.total, drink?.measure);
            svg.push(text(m['baroo.tap_screen.tap_card']({}, { locale: ctx.i18n.locale }), { y: 302, size: 16, fill: COLORS.muted }));
            break;
        }

        case 'unsealed': {
            const drink = await getBarOfferItem(pb, barSlug, spec.item);
            const name = drink?.name ?? spec.item;

            svg.push(rect(0, 0, SCREEN_WIDTH, 40, COLORS.ok));
            svg.push(text(`✓ ${m['baroo.tap_screen.unsealed']({}, { locale: ctx.i18n.locale })}`, { y: 27, size: 18, weight: 700, fill: COLORS.text }));

            await picture(ctx, svg, layers, offerItemImageRef(drink), name, { left: 50, top: 48, size: 140, shape: 'rounded' });
            svg.push(text(name, { y: 220, size: 26, weight: 700, fill: COLORS.text }));

            if (spec.total) gauge(ctx, svg, 232, gaugeMode, spec.left ?? spec.total, spec.total, drink?.measure);
            if (spec.label) svg.push(text(spec.label, { y: 292, size: 18, fill: COLORS.accent }));
            break;
        }

        case 'offer':
        case 'served': {
            const [holder, drink] = await Promise.all([
                lookupCard(pb, barSlug, spec.serial),
                getBarOfferItem(pb, barSlug, spec.item),
            ]);
            const name = holder?.nickName || m['baroo.tap_screen.greeting_unknown']({}, { locale: ctx.i18n.locale });
            const drinkName = drink?.name ?? spec.item;

            // The same for both, so confirming a serving changes only the row of buttons
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, barMemberImage(holder) ?? null, holder?.nickName || '?', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(text(name, { y: 228, size: 34, weight: 700, fill: COLORS.text }));
            svg.push(text(drinkName, { y: 258, size: 22, fill: COLORS.accent }));

            const gap = 12;

            if (spec.view === 'served') {
                const serving = drink?.servings.find((candidate) => candidate.key === spec.variant);
                const served = serving && drink
                    ? `${ctx.i18n.pick(serving.name) ?? serving.label} ${servingText(serving, drink.measure, ctx.i18n.locale)}`
                    : spec.variant;
                const width = SCREEN_WIDTH - 2 * gap;
                svg.push(`<rect x="${gap}" y="274" width="${width}" height="38" rx="19" fill="${COLORS.ok}"/>`);
                svg.push(text(`✓ ${served}`, { y: 300, size: 22, weight: 700, fill: COLORS.text, maxWidth: width - 16 }));
                break;
            }

            const variants = (spec.variants ?? '').split(',').filter(Boolean);

            // Each in its place above its key, in the key's color
            const buttons = tapButtons(session.tap);
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

        case 'unknown-card': {
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, null, '?', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(text(m['baroo.tap_screen.unknown_card']({}, { locale: ctx.i18n.locale }), { y: 236, size: 26, weight: 700, fill: COLORS.text }));
            svg.push(text(spec.serial, { y: 272, size: 18, fill: COLORS.accent }));
            break;
        }

        case 'error': {
            svg.push(text(label, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(ctx, svg, layers, null, '!', { left: 45, top: 42, size: 150, shape: 'circle' });
            svg.push(rect(0, 214, SCREEN_WIDTH, SCREEN_HEIGHT - 214, COLORS.error));
            svg.push(text(spec.text, { y: spec.hint ? 254 : 270, size: 24, weight: 700, fill: COLORS.text }));
            if (spec.hint) svg.push(text(spec.hint, { y: 288, size: 16, fill: COLORS.text }));
            break;
        }
    }

    const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`
        + rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, COLORS.background)
        + svg.join('')
        + '</svg>';

    return sharp(Buffer.from(frame)).composite(layers).removeAlpha().raw().toBuffer();
}

/**
 * The package as a bar: what is left of it with "32,5 / 50 l" on it, or what got poured from
 * it with "Načepováno 17,5 l". Either way amber when little is left and red once it is gone
 */
function gauge(
    ctx: ScreenCtx,
    svg: string[],
    top: number,
    mode: GaugeMode,
    left: number,
    total: number,
    measure: Measure = 'volume',
): void {
    const x = 16;
    const width = SCREEN_WIDTH - 2 * x;
    const height = 26;
    const leftShare = Math.max(0, Math.min(1, left / total));
    const fill = leftShare <= 0 ? COLORS.error : leftShare <= LOW_SHARE ? COLORS.low : COLORS.ok;

    const poured = roundQuantity(total - left);
    const share = mode === 'poured' ? 1 - leftShare : leftShare;
    const caption = mode === 'poured'
        ? m[`baroo.tap_screen.${measure === 'volume' ? 'poured' : 'served'}`]({ quantity: formatQuantity(measure, poured, ctx.i18n.locale) }, { locale: ctx.i18n.locale })
        : `${formatQuantity(measure, left, ctx.i18n.locale)} / ${formatQuantity(measure, total, ctx.i18n.locale)}`;

    svg.push(`<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="${height / 2}" fill="${COLORS.track}"/>`);
    if (share > 0) {
        // Never thinner than its rounded ends
        svg.push(`<rect x="${x}" y="${top}" width="${Math.max(height, width * share)}" height="${height}" rx="${height / 2}" fill="${fill}"/>`);
    }

    svg.push(text(caption, { y: top + 18, size: 15, weight: 700, fill: COLORS.text, maxWidth: width - 16 }));
}

/** Falls back to the name's initial on a colored shape */
async function picture(
    ctx: Pick<App.Locals, "logger">,
    svg: string[],
    layers: Layer[],
    image: PbImageRef | null,
    name: string,
    box: { left: number; top: number; size: number; shape: 'circle' | 'rounded' },
): Promise<void> {
    if (image) {
        try {
            layers.push({ input: await fetchImage(image, box.size, box.shape), top: box.top, left: box.left });
            return;
        } catch (err) {
            ctx.logger.warn(`[taps] picture ${image.filename} unavailable: ${err instanceof Error ? err.message : err}`);
        }
    }

    const { left, top, size } = box;
    svg.push(box.shape === 'circle'
        ? `<circle cx="${left + size / 2}" cy="${top + size / 2}" r="${size / 2}" fill="${COLORS.placeholder}"/>`
        : `<rect x="${left}" y="${top}" width="${size}" height="${size}" rx="18" fill="${COLORS.placeholder}"/>`);

    const initial = [...name.trim()][0]?.toLocaleUpperCase() ?? '?';
    svg.push(`<text x="${left + size / 2}" y="${top + size / 2}" dy="0.35em" font-family="${FONT}" font-size="${Math.round(size * 0.5)}" font-weight="700" fill="${COLORS.background}" text-anchor="middle">${escapeXml(initial)}</text>`);
}

const IMAGE_TIMEOUT_MS = 3000;
/**
 * PocketBase's thumb rather than the upload, which it makes once and keeps on disk.
 * Must be among the field's `thumbs`, or PocketBase hands over the original
 */
const THUMB = '250x250';

async function fetchImage(image: PbImageRef, size: number, shape: 'circle' | 'rounded'): Promise<Buffer> {
    const base = env.PB_BASE_URL?.replace(/\/$/, '');
    if (!base) throw new Error('PB_BASE_URL not set');

    const url = `${base}/api/files/${image.collection}/${image.recordId}/${encodeURIComponent(image.filename)}?thumb=${THUMB}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return cutOut(Buffer.from(await response.arrayBuffer()), size, shape);
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
