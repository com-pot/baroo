<script lang="ts">
import * as m from "$lib/paraglide/messages.js";
import type { BarOrderItem } from "$lib/bar/BarModel";
import { servingPreset } from "$lib/bar/servings";
import type { TagMapping } from "$lib/bar/tags";
import type { BarOfflineStore } from "$lib/offline/store.svelte";

const {
    store,

    activeMapping,
    items,
    onOrderDone,
}: {
    store: Pick<BarOfflineStore, "offerItems" | "barOffer" | "summaries" | "process" | "standing" | "findMember">,

    activeMapping: TagMapping,
    items: OrderItem[],
    onOrderDone: () => unknown,
} = $props()

type OrderItem = Pick<BarOrderItem, "key" | "variant">;
const balanceCtrl = $state({
    orderItems: [] as OrderItem[],

    addToOrder(item: OrderItem) {
        this.orderItems.push(item);
    },

    removeFromOrder(key: OrderItem["key"]) {
        this.orderItems = this.orderItems
            .filter((item) => item.key !== key)
    },

    hasItemsInOrder(key: OrderItem["key"]): boolean {
        return this.orderItems.some((item) => item.key === key)
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
    for (const item of balanceCtrl.orderItems) {
        const key = `${item.key}-${item.variant}`;
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
});

</script>

<div class="card">
    <div class="card-header">
        <img
            class="avatar-1x1"
            src={activeMapping.extra?.avatar_1x1
                ? `/storage/api/files/bar_members/${activeMapping.member.id}/${activeMapping.extra.avatar_1x1}`
                : '/assets/default-badge.svg'
            }
            alt=""
        />
        <h2>
            {m["baroo.bar.order.title_new"]({ userName: activeMapping.member.nickName || "" })}
        </h2>
    </div>
    <div class="card-body offer">
        {#each store.offerItems as item (item.key)}
            {@const servings = servingPreset(item.servingPreset).servings.filter((serving) => item.pricing?.[serving.key] != null)}
            <div class="card item" data-key={item.key}>
                <span class="item-name">{item.name}</span>
                {#if item.preview_1x1}
                    <div class="bg frame preview">
                        <img src={`/storage/api/files/bar_offer_items/${item.id}/${item.preview_1x1}`} alt="" />
                    </div>
                {/if}
                <div class="variants">
                    {#each servings as serving (serving.key)}
                        <button
                            data-value={serving.key}
                            onclick={() => balanceCtrl.addToOrder({ key: item.key, variant: serving.key })}
                        >
                            <span class="amount"
                                >{currentOrderCounts[
                                    `${item.key}-${serving.key}`
                                ] || 0}</span
                            >
                            <span role="separator">×</span>
                            <kbd>{serving.label}</kbd>
                        </button>
                    {/each}
                </div>
                <div class="actions">
                    <button
                        data-action="removeFromOrder"
                        class:inactive={!balanceCtrl.hasItemsInOrder(item.key)}
                        aria-label={m["baroo.bar.order.cancel"]()}
                        onclick={() =>
                            balanceCtrl.removeFromOrder(item.key)}
                        >❌</button
                    >
                </div>
            </div>
        {/each}
    </div>
    <div class="card-footer controls">
        <button
            class="btn btn-primary"
            data-action="confirm"
            disabled={!balanceCtrl.orderItems.length}
            onclick={() => balanceCtrl.confirmOrder()}
            >{m["baroo.bar.order.confirm"]()}</button
        >
    </div>
</div>

<style lang="scss">
    [data-action="confirm"] {
        font-size: 2rem;
        min-width: 80%;
    }
</style>
