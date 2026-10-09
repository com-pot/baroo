<script lang="ts">
    import { quantityLeft } from "$lib/bar/stats/barOfferItems";
    import { servingLabel } from "$lib/bar/servings";
    import { formatQuantity, measureLabel } from "$lib/bar/quantity";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import type { UnsealEvent } from "$lib/bar/ops/unseal";

    const {
        event,
        offerItem,
    }: {
        event: UnsealEvent;
        offerItem: Pick<BarOfferItem, "servingPreset">;
    } = $props();

    const closure = $derived(event.data.closureData);
</script>

<div class="closure-details">
    <div class="closure-info">
        <p>
            <strong>Opened:</strong>
            {#if closure.unsealedAt}
                {new Date(closure.unsealedAt).toLocaleString()}
            {:else}
                —
            {/if}
        </p>
        <p>
            <strong>Closed:</strong>
            {new Date(event.created).toLocaleString()}
        </p>
        <p>
            <strong>Total:</strong>
            {formatQuantity(closure.measure, closure.totalQuantity)} ({closure.totalOrders} orders)
        </p>
        {#if closure.quantity !== null}
            <p>
                <strong>Package:</strong>
                {formatQuantity(closure.measure, closure.quantity)} —
                {formatQuantity(closure.measure, quantityLeft(closure.quantity, closure.totalQuantity))}
                unaccounted for
            </p>
        {/if}
    </div>

    {#if closure.variantCounts && Object.keys(closure.variantCounts).length > 0}
        <div class="variant-breakdown">
            <strong>Variants:</strong>
            <div class="items-grid -tight">
                {#each Object.entries(closure.variantCounts) as [variant, count]}
                    <div class="tile">
                        <span class="label">{servingLabel(offerItem.servingPreset, variant)}</span>
                        <span role="separator">×</span>
                        <span class="value">{count}</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    {#if closure.memberStats && closure.memberStats.length > 0}
        <section>
            <heading>Top Consumers:</heading>
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>{measureLabel(closure.measure)}</th>
                        <th>Orders</th>
                        <th>Spent</th>
                    </tr>
                </thead>
                <tbody>
                    {#each closure.memberStats as member}
                        <tr>
                            <td>{member.memberName}</td>
                            <td>{formatQuantity(closure.measure, member.quantity)}</td>
                            <td>{member.count}</td>
                            <td>{member.spent} Kč</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </section>
    {/if}
</div>

<style lang="scss">
    .closure-details {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;

    .closure-info {
        font-size: 0.95rem;

        p {
            margin: 0.5rem 0;
        }
    }

    .variant-breakdown,
    .member-stats {
        strong {
            display: block;
            margin-bottom: 0.75rem;
            color: #495057;
            font-size: 1rem;
        }
    }

    .member-stats {
        table {
            margin-bottom: 0;
            font-size: 0.9rem;
        }
    }
}
</style>
