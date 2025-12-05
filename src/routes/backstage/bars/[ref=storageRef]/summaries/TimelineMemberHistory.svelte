<script lang="ts">
    import "./timeline.scss";
    import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
    import * as m from '$lib/paraglide/messages.js';
    import { getRenderer } from '$lib/rendering.svelte';

    const renderer = getRenderer()

    const {
        timeline,
        showProfileBadge,
    }: {
        timeline: MemberTimelineEntry[];
        showProfileBadge: () => void;
    } = $props();
</script>

<div class="timeline">
    {#if timeline === null}
        <div class="empty-state">
            <p>{m["baroo.backstage.summaries.loading"]()}</p>
        </div>
    {:else if timeline.length === 0}
        <div class="empty-state">
            <p>{m["generic.list.no_items"]()}</p>
        </div>
    {:else}
        {#each timeline as event (event.date)}
            <div class="timeline-item" data-type={event.type}>
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                    {#if event.type === 'settlement'}
                        <article class="timeline-event settlement">
                            <header class="action-header">
                                <strong>{m["baroo.backstage.summaries.settled_event"]()}</strong>
                                <div class="actions">
                                    <button type="button" class="btn btn-sm btn-outline-primary"
                                        onclick={() => showProfileBadge()}
                                    >{m["baroo.backstage.summaries.show_profile"]()}</button>
                                </div>
                            </header>
                            <div class="amount">{m["baroo.backstage.summaries.due"]({ amountWithCurrency: (event.data.amountDue?.toFixed(2) || "0") + " Kč" })}</div>
                            <div class="amount">{m["baroo.backstage.summaries.paid"]({ amountWithCurrency: (event.data.amountPaid?.toFixed(2) || "0") + " Kč" })}</div>
                            <time>{renderer.formatDate(event.date)}</time>
                        </article>
                    {:else if event.type === 'order'}
                        <div class="timeline-event order">
                            <strong>{m["baroo.backstage.summaries.ordered_event"]()}</strong>
                            <div class="order-detail">
                                "{event.data.key}" ({event.data.variant})
                            </div>
                            <time>{renderer.formatDate(event.date)}</time>
                        </div>
                    {/if}
                </div>
            </div>
        {/each}
    {/if}
</div>
