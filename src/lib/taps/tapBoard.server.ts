import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BarOfferItem } from '$lib/bar/BarModel';
import {
    compareTaps,
    computeOfferStock,
    consumedSince,
    quantityLeft,
    replayStock,
    roundQuantity,
    snapshotStockEvents,
    type OfferStock,
    type StockEvent,
} from '$lib/bar/stats/barOfferItems';
import { SERVING_PRESETS } from '$lib/bar/servings';
import type { BarSnapshot } from '$lib/offline/types';
import { tapCacheDir } from './tapDirectory.server';
import { emit, listTappers } from './tapHub.server';
import type { TapState } from './tapEvents';

/** An order, as far as the stock on tap cares */
export type BoardOrder = {
    clientId?: string;
    offerItemKey: string;
    variant: string;
    orderedAt: string;
};

type Heard<T> = T & { clientId: string; heardAt: string };

type BarBoard = {
    /** What PocketBase knew at the latest snapshot pull */
    base: {
        /** Serving preset per offer item key */
        presets: Record<string, string>;
        events: StockEvent[];
        /** Only the ones drawing from open stock */
        orders: BoardOrder[];
    };
    /** Heard of since from the TapTappers and kiosks, kept until a snapshot has it */
    journal: {
        events: Heard<StockEvent>[];
        orders: Heard<BoardOrder>[];
    };
};

type BoardFile = { version: 1; bars: Record<string, BarBoard> };

/** Long enough for an offline kiosk to come back and sync */
const JOURNAL_TTL_MS = 24 * 60 * 60_000;

/**
 * What is on each tap and how much of it is left - the venue server's own reckoning, which
 * the TapTappers show and never work out themselves
 *
 * PocketBase's word from the latest snapshot pull, plus what the TapTappers and kiosks told
 * the server since: pours, packages tapped on, kiosk ops not synced yet. Persisted to disk
 * so a restart without PocketBase keeps it.
 */
let board: Promise<BoardFile> | null = null;
let writes: Promise<void> = Promise.resolve();

function boardPath(): string {
    return join(tapCacheDir(), 'board.json');
}

function load(ctx: Pick<App.Locals, "logger">): Promise<BoardFile> {
    return (board ??= readFile(boardPath(), 'utf8')
        .then((text): BoardFile => {
            const parsed = JSON.parse(text);
            return parsed?.version === 1 ? parsed : { version: 1, bars: {} };
        })
        .catch((err: NodeJS.ErrnoException): BoardFile => {
            if (err.code !== 'ENOENT') ctx.logger.warn(err, '[taps] board unreadable, starting empty');
            return { version: 1, bars: {} };
        }));
}

function emptyBar(): BarBoard {
    return {
        base: { presets: {}, events: [], orders: [] },
        journal: { events: [], orders: [] },
    };
}

/**
 * Takes what PocketBase knows from a snapshot, dropping the journal entries it has now
 *
 * Never throws, returns whether anything changed.
 */
export async function learnSnapshot(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    snapshot: Pick<BarSnapshot, 'offerItems' | 'unseals' | 'flushes' | 'timelines'>,
): Promise<boolean> {
    try {
        const all = await load(ctx);
        const previous = all.bars[barSlug] ?? emptyBar();

        const events = snapshotStockEvents(snapshot);
        const orders: BoardOrder[] = [];
        const synced = new Set(events.flatMap((event) => event.clientId ? [event.clientId] : []));

        for (const timeline of Object.values(snapshot.timelines)) {
            for (const entry of timeline) {
                if (entry.type !== 'order') continue;
                if (entry.data.clientId) synced.add(entry.data.clientId);
                orders.push({ clientId: entry.data.clientId, offerItemKey: entry.data.key, variant: entry.data.variant, orderedAt: entry.date });
            }
        }

        const heardAfter = Date.now() - JOURNAL_TTL_MS;
        const journal: BarBoard["journal"] = {
            events: previous.journal.events.filter((event) => !synced.has(event.clientId) && Date.parse(event.heardAt) > heardAfter),
            orders: previous.journal.orders.filter((order) => !synced.has(order.clientId) && Date.parse(order.heardAt) > heardAfter),
        };

        // Stock the journal opened counts the synced orders since, too
        const { runs } = replayStock([...events, ...journal.events]);

        const fresh: BarBoard = {
            base: {
                presets: Object.fromEntries(snapshot.offerItems
                    .filter((item) => item.servingPreset in SERVING_PRESETS.index)
                    .map((item) => [item.key, item.servingPreset])),
                events,
                orders: orders.filter((order) => {
                    const run = runs[order.offerItemKey];
                    return !!run && order.orderedAt >= run.openedAt;
                }),
            },
            journal,
        };

        if (JSON.stringify(previous) === JSON.stringify(fresh)) return false;

        all.bars[barSlug] = fresh;
        await save(all);
        return true;
    } catch (err) {
        ctx.logger.error(err, '[taps] could not learn the snapshot');
        return false;
    }
}

/** Never throws, returns whether any of it was news */
export async function journal(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    heard: { events?: (StockEvent & { clientId: string })[]; orders?: (BoardOrder & { clientId: string })[] },
): Promise<boolean> {
    try {
        const all = await load(ctx);
        const bar = (all.bars[barSlug] ??= emptyBar());

        const known = new Set([...bar.base.events, ...bar.base.orders, ...bar.journal.events, ...bar.journal.orders]
            .map((entry) => entry.clientId));
        const heardAt = new Date().toISOString();

        let news = 0;
        for (const event of heard.events ?? []) {
            if (known.has(event.clientId)) continue;
            bar.journal.events.push({ ...event, heardAt });
            news++;
        }
        for (const order of heard.orders ?? []) {
            if (known.has(order.clientId)) continue;
            bar.journal.orders.push({ ...order, heardAt });
            news++;
        }

        if (news) await save(all);
        return news > 0;
    } catch (err) {
        ctx.logger.error(err, '[taps] could not journal');
        return false;
    }
}

async function read(ctx: Pick<App.Locals, "logger">, barSlug: string) {
    const bar = (await load(ctx)).bars[barSlug] ?? emptyBar();

    return {
        presets: bar.base.presets,
        events: [...bar.base.events, ...bar.journal.events],
        orders: [...bar.base.orders, ...bar.journal.orders],
    };
}

/** Every tap with something on it or a TapTapper at it */
export async function tapStates(ctx: Pick<App.Locals, "logger">, barSlug: string): Promise<TapState[]> {
    const { presets, events, orders } = await read(ctx, barSlug);
    const { runs, taps } = replayStock(events);
    const tappers = listTappers(barSlug);

    const ids = new Set([...Object.keys(taps), ...tappers.keys()]);

    return [...ids].sort(compareTaps).map((tap): TapState => {
        const offerItemKey = taps[tap]?.offerItemKey ?? null;
        const run = offerItemKey ? runs[offerItemKey] : undefined;
        const preset = offerItemKey ? presets[offerItemKey] : undefined;

        return {
            tap,
            offerItemKey,
            stock: run && preset
                ? {
                    quantity: roundQuantity(run.quantity),
                    left: quantityLeft(run.quantity, consumedSince(
                        preset,
                        orders.filter((order) => order.offerItemKey === offerItemKey),
                        run.openedAt,
                    )),
                    unsealedAt: run.openedAt,
                    packageId: run.packageId,
                }
                : null,
            tapper: tappers.get(tap) ?? null,
        };
    });
}

export async function tapState(ctx: Pick<App.Locals, "logger">, barSlug: string, tap: string): Promise<TapState> {
    return (await tapStates(ctx, barSlug)).find((state) => state.tap === tap)
        ?? { tap, offerItemKey: null, stock: null, tapper: null };
}

/** Stock of the offer as the board reckons it - only open stock is worth anything */
export async function boardStock(ctx: Pick<App.Locals, "logger">, barSlug: string, offerItems: BarOfferItem[]): Promise<OfferStock[]> {
    const { events, orders } = await read(ctx, barSlug);

    return computeOfferStock({
        offerItems,
        events,
        orderItems: orders.map((order) => ({ key: order.offerItemKey, variant: order.variant, orderedAt: order.orderedAt })),
    });
}

/** Tells every listener what is on the taps now */
export async function broadcastTaps(ctx: Pick<App.Locals, "logger">, barSlug: string): Promise<void> {
    emit(ctx, barSlug, { type: 'taps', taps: await tapStates(ctx, barSlug), at: new Date().toISOString() });
}

function save(all: BoardFile): Promise<void> {
    // Serialized so an older state can't overwrite a newer one
    const write = writes.then(() => persist(all));
    writes = write.catch(() => {});
    return write;
}

async function persist(all: BoardFile): Promise<void> {
    const path = boardPath();
    const temporary = `${path}.tmp`;

    await mkdir(tapCacheDir(), { recursive: true });
    await writeFile(temporary, JSON.stringify(all));
    await rename(temporary, path);
}
