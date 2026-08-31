<script lang="ts">
    import { quantityLeft, type UnsealEvent } from "$lib/bar/stats/barOfferItems";
    import { labelForServingKey } from "$lib/bar/servings";
    import { formatQuantity, measureLabel } from "$lib/bar/quantity";

    const {
        event,
    }: {
        event: UnsealEvent;
    } = $props();

    const closure = $derived(event.data.closureData);
    // Frozen with the report — the item's preset may be a different one by now.
    const measure = $derived(closure.measure);
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
            {formatQuantity(measure, closure.totalQuantity)} ({closure.totalOrders} orders)
        </p>
        {#if closure.quantity !== null}
            <p>
                <strong>Package:</strong>
                {formatQuantity(measure, closure.quantity)} —
                {formatQuantity(measure, quantityLeft(closure.quantity, closure.totalQuantity))}
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
                        <span class="label">{labelForServingKey(variant)}</span>
                        <span role="separator">×</span>
                        <span class="value">{count}</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    {#if closure.memberStats && closure.memberStats.length > 0}
        <div class="member-stats">
            <strong>Top Consumers:</strong>
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>{measureLabel(measure)}</th>
                        <th>Orders</th>
                        <th>Spent</th>
                    </tr>
                </thead>
                <tbody>
                    {#each closure.memberStats as member}
                        <tr>
                            <td>{member.memberName}</td>
                            <td>{formatQuantity(measure, member.quantity)}</td>
                            <td>{member.count}</td>
                            <td>{member.spent} Kč</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
