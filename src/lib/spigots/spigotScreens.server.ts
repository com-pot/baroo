import sharp from 'sharp';
import z from 'zod';
import * as m from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import { directoryVersion, lookupCard, lookupDrink, type StoredImage } from './spigotDirectory.server';
import { imagesVersion, readImage } from './spigotImages.server';

/**
 * What the spigot stations' displays show, drawn here and shipped as pixels.
 *
 * A Pico has neither the memory nor the fonts to lay out a name in Czech next to a photo,
 * so the venue server does it: every screen is a 240×320 picture in the panel's own
 * format (RGB565, high byte first), which the station streams to the display unread. The
 * station only draws for itself what it must show without a server.
 */

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;

/** How long a station shows what a scan did before it goes back to its idle screen. */
export const SCREEN_HOLD_MS = 5000;

const spigotId = z.string().regex(/^[a-z0-9-]{1,16}$/);
const beverageKey = z.string().regex(/^[a-z0-9-]{1,32}$/);

export const screenSpecSchema = z.discriminatedUnion('view', [
    /** The drink on tap — or, freshly set by a beverage tag, with a banner saying so. */
    z.object({ view: z.enum(['idle', 'assigned']), spigot: spigotId, beverage: beverageKey.optional() }),
    /** Who just tapped, and what they are getting. */
    z.object({
        view: z.literal('pour'),
        spigot: spigotId,
        beverage: beverageKey,
        serial: z.string().regex(/^[0-9a-f]{4,40}$/),
        warn: z.literal('no-kiosk').optional(),
    }),
    /** A member card at a spigot that has no drink yet. */
    z.object({ view: z.literal('unset'), spigot: spigotId }),
]);

export type ScreenSpec = z.infer<typeof screenSpecSchema>;

/**
 * Where a station fetches a screen. The station follows these paths without reading them,
 * and redraws only when a path changes — so `v` changes with anything the screen shows:
 * the bar learned anew, a picture that has finished arriving.
 */
export function screenPath(barSlug: string, spec: ScreenSpec): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(spec)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
    }
    query.set('v', `${directoryVersion()}.${imagesVersion()}`);
    return `/api/bars/${encodeURIComponent(barSlug)}/spigots/screen?${query}`;
}

const CACHE_SIZE = 24;
const cache = new Map<string, Buffer>();

/** The screen as RGB565 pixels, high byte first, row by row. */
export async function renderScreen(barSlug: string, spec: ScreenSpec): Promise<Buffer> {
    // A screen is out of date once the bar changes or a missing picture arrives.
    const key = [barSlug, getLocale(), directoryVersion(), imagesVersion(), JSON.stringify(spec)].join('|');

    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }

    const pixels = toRgb565(await draw(barSlug, spec));
    cache.set(key, pixels);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);

    return pixels;
}

// --- layouts ----------------------------------------------------------------------

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

async function draw(barSlug: string, spec: ScreenSpec): Promise<Buffer> {
    const svg: string[] = [];
    const layers: Layer[] = [];
    const spigotLabel = m['baroo.bar.spigot.title']({ spigot: spec.spigot });

    switch (spec.view) {
        case 'idle':
        case 'assigned': {
            const drink = spec.beverage ? await lookupDrink(barSlug, spec.beverage) : null;
            const name = spec.beverage
                ? drink?.name ?? spec.beverage
                : m['baroo.spigot_screen.no_drink']();

            if (spec.view === 'assigned') {
                svg.push(rect(0, 0, SCREEN_WIDTH, 40, COLORS.ok));
                svg.push(text(`✓ ${m['baroo.spigot_screen.assigned']()}`, { y: 27, size: 18, weight: 700, fill: COLORS.text }));
            } else {
                svg.push(text(spigotLabel, { y: 26, size: 16, fill: COLORS.muted }));
            }

            await picture(svg, layers, drink?.image ?? null, spec.beverage ? name : '?', { left: 30, top: 44, size: 180, shape: 'rounded' });
            svg.push(text(name, { y: 262, size: 30, weight: 700, fill: COLORS.text }));
            svg.push(text(
                spec.beverage ? m['baroo.spigot_screen.tap_card']() : m['baroo.spigot_screen.tap_drink_tag'](),
                { y: 302, size: 16, fill: COLORS.muted },
            ));
            break;
        }

        case 'pour': {
            const [holder, drink] = await Promise.all([
                lookupCard(barSlug, spec.serial),
                lookupDrink(barSlug, spec.beverage),
            ]);
            // A card the kiosk knows but this server has not heard of yet — handed out on
            // the tablet since the last pull. The pour still goes through.
            const name = holder?.nickName || m['baroo.spigot_screen.greeting_unknown']();

            svg.push(text(spigotLabel, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(svg, layers, holder?.image ?? null, holder?.nickName || '?', { left: 45, top: 42, size: 150, shape: 'circle' });

            if (spec.warn === 'no-kiosk') {
                // The pour reached nobody: the customer has to go and tell someone, so this
                // takes the bottom of the screen and the text moves up to make room.
                svg.push(text(name, { y: 228, size: 34, weight: 700, fill: COLORS.text }));
                svg.push(text(drink?.name ?? spec.beverage, { y: 258, size: 22, fill: COLORS.accent }));
                svg.push(rect(0, 270, SCREEN_WIDTH, 50, COLORS.error));
                svg.push(text(m['baroo.spigot_screen.no_kiosk'](), { y: 291, size: 17, weight: 700, fill: COLORS.text }));
                svg.push(text(m['baroo.spigot_screen.no_kiosk_hint'](), { y: 311, size: 14, fill: COLORS.text }));
            } else {
                svg.push(text(name, { y: 236, size: 34, weight: 700, fill: COLORS.text }));
                svg.push(text(drink?.name ?? spec.beverage, { y: 270, size: 22, fill: COLORS.accent }));
                svg.push(text(m['baroo.spigot_screen.pick_size'](), { y: 306, size: 15, fill: COLORS.muted }));
            }
            break;
        }

        case 'unset': {
            svg.push(text(spigotLabel, { y: 26, size: 16, fill: COLORS.muted }));
            await picture(svg, layers, null, '!', { left: 45, top: 42, size: 150, shape: 'circle' });
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

/** The photo, cut to shape — or, without one, the name's initial on a coloured disc. */
async function picture(
    svg: string[],
    layers: Layer[],
    image: StoredImage | null,
    name: string,
    box: { left: number; top: number; size: number; shape: 'circle' | 'rounded' },
): Promise<void> {
    const bytes = image ? await readImage(image) : null;

    if (bytes) {
        try {
            layers.push({ input: await cutOut(bytes, box.size, box.shape), top: box.top, left: box.left });
            return;
        } catch (err) {
            // A picture sharp cannot read is drawn as if there were none.
            console.warn('[spigots] unreadable picture:', err instanceof Error ? err.message : err);
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

/**
 * A centred line, shrunk to fit and clipped as a last resort. The widths are estimates —
 * there is no font measuring here — generous enough for names and drink names.
 */
function text(
    content: string,
    style: { y: number; size: number; fill: string; weight?: 400 | 700; maxWidth?: number },
): string {
    const { y, fill, weight = 400, maxWidth = SCREEN_WIDTH - 20 } = style;
    const perChar = weight === 700 ? 0.62 : 0.56;
    const chars = [...content];

    const size = Math.max(12, Math.min(style.size, Math.floor(maxWidth / (Math.max(chars.length, 1) * perChar))));
    const fits = Math.floor(maxWidth / (size * perChar));
    const shown = chars.length > fits ? chars.slice(0, Math.max(fits - 1, 1)).join('') + '…' : content;

    return `<text x="${SCREEN_WIDTH / 2}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${escapeXml(shown)}</text>`;
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

/** RGB, 3 bytes a pixel → RGB565, 2 bytes a pixel, high byte first — what the panel takes. */
function toRgb565(rgb: Buffer): Buffer {
    const out = Buffer.alloc((rgb.length / 3) * 2);
    for (let i = 0, o = 0; i < rgb.length; i += 3, o += 2) {
        const value = ((rgb[i] & 0xf8) << 8) | ((rgb[i + 1] & 0xfc) << 3) | (rgb[i + 2] >> 3);
        out[o] = value >> 8;
        out[o + 1] = value & 0xff;
    }
    return out;
}
