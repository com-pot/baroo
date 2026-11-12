<script lang="ts">
import * as m from "$lib/paraglide/messages.js";
import { computeTotalPrice } from "$lib/bar/stats/memberSummaries";
import { servingText, type Serving } from "$lib/bar/servings";
import type { BarOrderItem } from "$lib/bar/BarModel";
import type { BarOfflineStore } from "$lib/offline/store.svelte";
import type { TagMapping } from "$lib/bar/tags";
import SettlementWidget from "./SettlementWidget.svelte";
import { getRenderer } from "$lib/rendering.svelte";
import { barMemberAvatar } from "$lib/ui/pbFiles";
import type { Measure } from "$lib/si/measure";

const renderer = getRenderer()

const {
    store,

    activeMapping,
    items,
    enableSettlement = false,
}: {
    store: Pick<BarOfflineStore, "offerItems" | "barOffer" | "summaries" | "process" | "standing" | "findMember" | "currency">,

    activeMapping: TagMapping,
    items: Pick<BarOrderItem, "key" | "variant">[],
    enableSettlement?: boolean,
} = $props()

const summaryRows = $derived.by(() => {
    type ItemCountEntry = {
        name: string;
        valueCounts: Record<string, {
            variant: BarOrderItem["variant"],
            measure: Measure,
            serving: Serving,
            price: number,
            count: number,
        }>;
    }
    const itemCounts: Record<string, ItemCountEntry> = {};

    for (const item of items || []) {
        const offerItem = store.offerItems.find((o) => o.key === item.key);
        if (!offerItem) {
            console.warn("Unknown offer item in balance:", item);
            continue
        }

        if (!itemCounts[item.key]) {
            itemCounts[item.key] = { name: offerItem.name, valueCounts: {} };
        }
        if (!itemCounts[item.key].valueCounts[item.variant]) {
            const serving = offerItem.servings.find((serving) => serving.key === item.variant)!

            itemCounts[item.key].valueCounts[item.variant] = {
                variant: item.variant,
                measure: offerItem.measure,
                serving,
                price: offerItem.pricing?.[item.variant] || 0,
                count: 0,
            };
        }
        itemCounts[item.key].valueCounts[item.variant].count++;
    }

    return Object.values(itemCounts)
            .map((item) => ({
                item: item.name,
                amount: Object.entries(item.valueCounts),
                price: Object.values(item.valueCounts).reduce(
                    (sum, vc) => sum + vc.count * vc.price,
                    0,
                ),
            }));
});

const summaryTotalPrice = $derived(
    computeTotalPrice(items || [], store.barOffer),
);
</script>

<div class="card">
    <div class="card-header">
        <img
            src={barMemberAvatar(activeMapping.member.id, activeMapping.extra?.avatar_1x1 as string)}
            alt=""
        />
        <h2>
            {m["baroo.bar.order.title_summary"]({ userName: activeMapping.member.nickName || "" })}
        </h2>
    </div>
    <div class="card-body summary -flush">
        <table class="table -sticky">
            <thead>
                <tr>
                    <th data-name="item">{m["baroo.bar.summary.item"]()}</th>
                    <th data-name="amount">{m["baroo.bar.summary.amount"]()}</th>
                    <th data-name="price">{m["baroo.bar.summary.price"]()}</th>
                </tr>
            </thead>
            <tbody>
                {#each summaryRows as item, i (i)}
                    <tr>
                        <td data-name="item">{item.item}</td>
                        <td data-name="amount">
                            {#each item.amount as [variant, amount] (variant)}
                                <span class="variant-sum">
                                    <span class="count">{amount.count}</span>
                                    <span class="mul">×</span>
                                    <span class="serving">{servingText(amount.serving, amount.measure)}</span>
                                    <span class="price">({renderer.formatCurrency(store.currency, amount.price)})</span>
                                </span>
                            {/each}
                        </td>
                        <td data-name="price">{renderer.formatCurrency(store.currency, item.price)}</td>
                    </tr>
                {/each}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="2">
                        {#if enableSettlement}
                        <SettlementWidget {store} member={activeMapping.member.id} />
                        {/if}
                    </td>
                    <td data-name="price">{renderer.formatCurrency(store.currency, summaryTotalPrice)}</td>
                </tr>
            </tfoot>
        </table>
    </div>
</div>
