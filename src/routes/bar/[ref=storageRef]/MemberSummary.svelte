<script lang="ts">
import * as m from "$lib/paraglide/messages.js";
import { computeTotalPrice } from "$lib/bar/stats/memberSummaries";
import { servingLabel } from "$lib/bar/servings";
import type { BarOrderItem } from "$lib/bar/BarModel";
import type { OfflineBar } from "$lib/offline/store.svelte";
import type { TagMapping } from "$lib/bar/tags";
import SettlementWidget from "./SettlementWidget.svelte";

const {
    bar,

    activeMapping,
    items,
}: {
    bar: Pick<OfflineBar, "offerItems" | "barOffer" | "summaries" | "process" | "standing" | "findMember">,

    activeMapping: TagMapping,
    items: Pick<BarOrderItem, "key" | "variant">[],
} = $props()

const summaryRows = $derived.by(() => {
    type ItemCountEntry = {
        name: string;
        valueCounts: Record<string, { value: string; price: number; count: number }>;
    }
    const itemCounts: Record<string, ItemCountEntry> = {};

    for (const item of items || []) {
        const offerItem = bar.offerItems.find((o) => o.key === item.key);
        if (!offerItem) {
            console.warn("Unknown offer item in balance:", item);
            continue
        }

        if (!itemCounts[item.key]) {
            itemCounts[item.key] = { name: offerItem.name, valueCounts: {} };
        }
        if (!itemCounts[item.key].valueCounts[item.variant]) {
            itemCounts[item.key].valueCounts[item.variant] = {
                value: servingLabel(offerItem, item.variant),
                price: offerItem.pricing?.[item.variant] || 0,
                count: 0,
            };
        }
        itemCounts[item.key].valueCounts[item.variant].count++;
    }

    return Object.values(itemCounts)
            .map((item) => ({
                item: item.name,
                amount: Object.values(item.valueCounts)
                    .map(
                        (data) =>
                            `${data.count}×${data.value}` +
                            (data.price ? ` (${data.price} Kč)` : ""),
                    )
                    .join(", "),
                price: Object.values(item.valueCounts).reduce(
                    (sum, vc) => sum + vc.count * vc.price,
                    0,
                ),
            }));
});

const summaryTotalPrice = $derived(
    computeTotalPrice(items || [], bar.barOffer),
);

const priceFormatter = new Intl.NumberFormat('cs', {
    style: 'currency',
    currency: "czk",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
})
</script>

<div class="card">
    <div class="card-header">
        <img
            class="avatar-1x1"
            src={activeMapping?.extra?.avatar_1x1
                ? `/storage/api/files/bar_members/${activeMapping.member.id}/${activeMapping.extra.avatar_1x1}`
                : '/assets/default-badge.svg'
            }
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
                        <td data-name="amount">{item.amount}</td>
                        <td data-name="price">{priceFormatter.format(item.price)}</td>
                    </tr>
                {/each}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="2">
                        <SettlementWidget bar={bar} member={activeMapping.member.id} />
                    </td>
                    <td data-name="price">{priceFormatter.format(summaryTotalPrice)}</td>
                </tr>
            </tfoot>
        </table>
    </div>
</div>
