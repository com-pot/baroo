<script lang="ts">
import * as m from "$lib/paraglide/messages.js";
import type { BarOfferItem } from "$lib/bar/BarModel";
import { servingPreset, servingText } from "$lib/bar/servings";
import { compareTaps } from "$lib/bar/stats/barOfferItems";
import type { TagMapping } from "$lib/bar/tags";
import type { BarOfflineStore } from "$lib/offline/store.svelte";
import type { OrderOp } from "$lib/offline/op";
import { barMemberAvatar, entityFileHref } from "$lib/ui/pbFiles";
import TapBadge from "./TapBadge.svelte";

const {
    store,

    activeMapping,
    taps,
    onOrderDone,
}: {
    store: Pick<BarOfflineStore, "offerItems" | "barOffer" | "summaries" | "process" | "standing" | "findMember">,

    activeMapping: TagMapping,
    /** What is on the taps - live from the server, or as this device knows it */
    taps: { tap: string, label?: string, offerItemKey: string | null }[],
    onOrderDone: () => unknown,
} = $props()

type OrderItem = OrderOp["items"][number];
/** Poured from a tap or not, the same item is apart */
const lineOf = (item: Pick<OrderItem, "key" | "tap">) => `${item.tap ?? ""}|${item.key}`;

const kioskOrderCtrl = $state({
    orderItems: [] as OrderItem[],

    addToOrder(item: OrderItem) {
        this.orderItems.push(item);
    },

    removeFromOrder(line: string) {
        this.orderItems = this.orderItems
            .filter((item) => lineOf(item) !== line)
    },

    hasItemsInOrder(line: string): boolean {
        return this.orderItems.some((item) => lineOf(item) === line)
    },

    async confirmOrder() {
        if (!this.orderItems.length) {
            return;
        }

        await store.process("order", {
            serialId: activeMapping.serialId,
            memberId: activeMapping.member.id,
            memberLabel: activeMapping.member.nickName,
            items: this.orderItems.slice(),
        });
        onOrderDone()
    },
});

const currentOrderCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const item of kioskOrderCtrl.orderItems) {
        const key = `${lineOf(item)}-${item.variant}`;
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
});

/** What the taps pour first, then what comes by the piece, the rest poured off the taps last */
const onTaps = $derived(taps
    .flatMap(({ tap, label, offerItemKey }) => {
        const item = offerItemKey ? store.barOffer[offerItemKey] : undefined;
        return item ? [{ tap, label, item }] : [];
    })
    .filter((entry, i, all) => all.findIndex((other) => other.tap === entry.tap) === i)
    .sort((a, b) => compareTaps(a.tap, b.tap)));
const byCount = $derived(store.offerItems.filter((item) => servingPreset(item.servingPreset).measure === "count"));
const byVolume = $derived(store.offerItems.filter((item) => servingPreset(item.servingPreset).measure === "volume"));

</script>

{#snippet offerCard(item: BarOfferItem, tap: { tap: string, label?: string } | null)}
    {@const itemPreset = servingPreset(item.servingPreset)}
    {@const servings = itemPreset.servings.filter((serving) => item.pricing?.[serving.key] != null)}
    {@const line = lineOf({ key: item.key, tap: tap?.tap })}
    <div class="card item" data-key={item.key} data-tap={tap?.tap}>
        <span class="item-name">
            {#if tap}
                <TapBadge tap={tap.tap} label={tap.label} />
            {/if}
            {item.name}
        </span>
        <div class="bg frame">
        {#if item.preview_1x1}
            <img src={entityFileHref('bar_offer_items', item.id, item.preview_1x1)} alt="" />
        {:else}
            <div class="placeholder"></div>
        {/if}
        </div>
        <div class="variants">
            {#each servings as serving (serving.key)}
                <button
                    data-value={serving.key}
                    onclick={() => kioskOrderCtrl.addToOrder({ key: item.key, variant: serving.key, tap: tap?.tap ?? null })}
                >
                    <kbd>{servingText(serving, itemPreset.measure)}</kbd>
                    <span class="amount">{currentOrderCounts[`${line}-${serving.key}`] || 0}</span>
                </button>
            {/each}
        </div>
        <div class="actions">
            <button
                data-action="removeFromOrder"
                class:inactive={!kioskOrderCtrl.hasItemsInOrder(line)}
                aria-label={m["baroo.bar.order.cancel"]()}
                onclick={() => kioskOrderCtrl.removeFromOrder(line)}
            >❌</button>
        </div>
    </div>
{/snippet}

<div class="card">
    <div class="card-header">
        <img
            class="avatar-1x1"
            src={barMemberAvatar(activeMapping.member.id, activeMapping.extra?.avatar_1x1 as string)}
            alt=""
        />
        <h2>
            {m["baroo.bar.order.title_new"]({ userName: activeMapping.member.nickName || "" })}
        </h2>
    </div>
    <div class="card-body offer">
        {#each onTaps as { tap, label, item } (tap)}
            {@render offerCard(item, { tap, label })}
        {/each}
        {#each byCount as item (item.key)}
            {@render offerCard(item, null)}
        {/each}
    </div>
    {#if byVolume.length}
        <details class="card-body off-tap">
            <summary>{m["baroo.bar.order.off_tap"]()}</summary>
            <div class="offer">
                {#each byVolume as item (item.key)}
                    {@render offerCard(item, null)}
                {/each}
            </div>
        </details>
    {/if}
    <div class="card-footer controls">
        <button
            class="btn btn-primary"
            data-action="confirm"
            disabled={!kioskOrderCtrl.orderItems.length}
            onclick={() => kioskOrderCtrl.confirmOrder()}
            >{m["baroo.bar.order.confirm"]()}</button
        >
    </div>
</div>

<style lang="scss">
    [data-action="confirm"] {
        font-size: 2rem;
        min-width: 80%;
    }

    .item-name {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .off-tap {
        border-block-start: 1px solid var(--bs-border-color);

        > summary {
            font-size: 1.5rem;
            font-weight: 600;
            color: #374151;
            cursor: pointer;
        }

        &[open] > summary {
            margin-block-end: 1rem;
        }
    }
</style>
