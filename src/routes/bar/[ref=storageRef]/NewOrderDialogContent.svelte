<script lang="ts">
import * as m from "$lib/paraglide/messages.js";
import type { BarOrderItem } from "$lib/bar/BarModel";
import { servingPreset, servingText } from "$lib/bar/servings";
import type { TagMapping } from "$lib/bar/tags";
import type { BarOfflineStore } from "$lib/offline/store.svelte";
import { barMemberAvatar, entityFileHref } from "$lib/ui/pbFiles";

const {
    store,

    activeMapping,
    onOrderDone,
}: {
    store: Pick<BarOfflineStore, "offerItems" | "barOffer" | "summaries" | "process" | "standing" | "findMember">,

    activeMapping: TagMapping,
    onOrderDone: () => unknown,
} = $props()

type OrderItem = Pick<BarOrderItem, "key" | "variant">;
const kioskOrderCtrl = $state({
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
    for (const item of kioskOrderCtrl.orderItems) {
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
            src={barMemberAvatar(activeMapping.member.id, activeMapping.extra?.avatar_1x1 as string)}
            alt=""
        />
        <h2>
            {m["baroo.bar.order.title_new"]({ userName: activeMapping.member.nickName || "" })}
        </h2>
    </div>
    <div class="card-body offer">
        {#each store.offerItems as item (item.key)}
            {@const itemPreset = servingPreset(item.servingPreset)}
            {@const servings = itemPreset.servings.filter((serving) => item.pricing?.[serving.key] != null)}
            <div class="card item" data-key={item.key}>
                <span class="item-name">{item.name}</span>
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
                            onclick={() => kioskOrderCtrl.addToOrder({ key: item.key, variant: serving.key })}
                        >
                            <kbd>{servingText(serving, itemPreset.measure)}</kbd>
                            <span class="amount">{currentOrderCounts[`${item.key}-${serving.key}`] || 0}</span>
                        </button>
                    {/each}
                </div>
                <div class="actions">
                    <button
                        data-action="removeFromOrder"
                        class:inactive={!kioskOrderCtrl.hasItemsInOrder(item.key)}
                        aria-label={m["baroo.bar.order.cancel"]()}
                        onclick={() => kioskOrderCtrl.removeFromOrder(item.key)}
                    >❌</button>
                </div>
            </div>
        {/each}
    </div>
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
</style>
