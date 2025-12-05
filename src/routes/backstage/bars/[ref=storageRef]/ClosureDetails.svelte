<script lang="ts">
    import type { PackageOpenEvent } from "$lib/bar/stats/barOfferItems";

    const {
        event,
    }: {
        event: PackageOpenEvent;
    } = $props();
</script>

<div class="closure-details">
    <div class="closure-info">
        <p>
            <strong>Opened:</strong>
            {#if event.data.closureData.lastUncorkDate}
                {new Date(event.data.closureData.lastUncorkDate).toLocaleString()}
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
            {event.data.closureData.totalLiters}L ({event.data.closureData.totalOrders} orders)
        </p>
    </div>

    {#if event.data.closureData.variantCounts && Object.keys(event.data.closureData.variantCounts).length > 0}
        <div class="variant-breakdown">
            <strong>Variants:</strong>
            <div class="items-grid -tight">
                {#each Object.entries(event.data.closureData.variantCounts) as [variant, count]}
                    <div class="tile">
                        <span class="label">{variant}</span>
                        <span role="separator">×</span>
                        <span class="value">{count}</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    {#if event.data.closureData.memberStats && event.data.closureData.memberStats.length > 0}
        <div class="member-stats">
            <strong>Top Consumers:</strong>
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>Liters</th>
                        <th>Orders</th>
                        <th>Spent</th>
                    </tr>
                </thead>
                <tbody>
                    {#each event.data.closureData.memberStats as member}
                        <tr>
                            <td>{member.memberName}</td>
                            <td>{member.liters}L</td>
                            <td>{member.count}</td>
                            <td>{member.spent} Kč</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
