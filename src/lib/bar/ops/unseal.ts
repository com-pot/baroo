import type { AppEvent } from "$lib/model/event";
import { type Bar } from "../BarModel";
import { barDoFlush, type ClosureData } from "./flush";

export type UnsealData = {
    offerItemKey: string;
    quantity: number;
    /** The tap the package goes on */
    tap?: string | null;
    /** Package kind the quantity came from */
    packageId?: string | null;
    /** Flush the item's open stock first, rather than add the package to it */
    flushCurrent: boolean;
}

export async function barDoUnseal(
    ctx: Pick<App.Locals, "pb">,
    slug: Bar["slug"],
    data: UnsealData & { clientId?: string; occurredAt?: string },
) {
    const { clientId, occurredAt = new Date().toISOString(), ...unseal } = data;

    if (unseal.flushCurrent) {
        await barDoFlush(ctx, slug, {
            offerItemKey: unseal.offerItemKey,
            clientId: clientId && `${clientId}:flush`,
            occurredAt,
        });
    }

    await ctx.pb.collection('events')
        .create({
            type: 'unseal',
            target: `bar:${slug}`,
            occurredAt,
            clientId,
            data: {
                offerItemKey: unseal.offerItemKey,
                quantity: unseal.quantity,
                tap: unseal.tap ?? null,
                packageId: unseal.packageId ?? null,
                flushCurrent: unseal.flushCurrent,
            },
        } satisfies Omit<UnsealEvent, "id">)
}

export type UnsealEvent = AppEvent<Omit<UnsealData, "flushCurrent"> & {
    /** Missing on unseals from before flush events, those always started a fresh package */
    flushCurrent?: boolean;
    /** Closure of the package an unseal from before flush events replaced */
    closureData?: ClosureData;
}>
