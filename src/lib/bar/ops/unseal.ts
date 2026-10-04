import type { Bar, BarOfferItem } from "../BarModel";
import { collectClosureData, type AppEvent, type ClosureData } from "../stats/barOfferItems";

type UnsealData = {
    offerItemKey: BarOfferItem["key"],
    quantity: number,
}

export async function barDoUnseal(ctx: Pick<App.Locals, "pb">, slug: Bar["slug"], data: UnsealData) {
    const closureData = await collectClosureData(ctx.pb, { slug }, data.offerItemKey);

    await ctx.pb.collection('events')
        .create({
            type: 'unseal',
            target: `bar:${slug}`,
            occurredAt: new Date().toISOString(),
            data: {
                offerItemKey: data.offerItemKey,
                quantity: data.quantity,
                closureData,
            },
        } satisfies Omit<UnsealEvent, "id">)
}

export type UnsealEvent = AppEvent<{
    offerItemKey: string;
    quantity: number;
    closureData: ClosureData;
}>
