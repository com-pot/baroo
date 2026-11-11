<script lang="ts">
    import { quantityLeft } from "$lib/bar/stats/barOfferItems";
    import { servingText } from "$lib/bar/servings";
    import { formatQuantity, measureLabel } from "$lib/bar/quantity";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import type { ClosureData } from "$lib/bar/ops/flush";

    const {
        closure,
        closedAt,
        offerItem,
    }: {
        closure: ClosureData;
        closedAt: string;
        offerItem: Pick<BarOfferItem, "measure"|"servings">;
    } = $props();
</script>

<div class="closure-details">
    <div class="closure-info">
        <p>
            <strong>Open:</strong>
            {#if closure.unsealedAt}
                <time datetime={closure.unsealedAt}>{new Date(closure.unsealedAt).toLocaleString()}</time>
            {:else}
                ///
            {/if}
            <span role="separator">-</span>
            <time datetime={closedAt}>{new Date(closedAt).toLocaleString()}</time>
        </p>
        <p>
            <strong>Total orders:</strong>
            {closure.totalOrders} ({formatQuantity(closure.measure, closure.totalQuantity)})
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
                {#each offerItem.servings as serving (serving.key)}
                    {@const count = closure.variantCounts[serving.key] ?? 0}
                    {#if count > 0}
                    <div class="tile">
                        <span class="label">{servingText(serving, offerItem.measure)}</span>
                        <span role="separator">×</span>
                        <span class="value">{count}</span>
                    </div>
                    {/if}
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
                    </tr>
                </thead>
                <tbody>
                    {#each closure.memberStats as member}
                        <tr>
                            <td>{member.memberName}</td>
                            <td>{formatQuantity(closure.measure, member.quantity)}</td>
                            <td>{member.count}</td>
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

    .variant-breakdown {
        strong {
            display: block;
            margin-bottom: 0.75rem;
            color: #495057;
            font-size: 1rem;
        }
    }
}
</style>
