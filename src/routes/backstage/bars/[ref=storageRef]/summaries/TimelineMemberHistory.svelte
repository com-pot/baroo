<script lang="ts">
    import "./timeline.scss";
    import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
    import * as m from '$lib/paraglide/messages.js';
    import { getRenderer } from '$lib/rendering.svelte';

    const renderer = getRenderer()

    const {
        timeline,
    }: {
        timeline: MemberTimelineEntry[];
    } = $props();
</script>

<div class="timeline">
    {#if timeline === null}
        <div class="card empty-state">
            <p>{m["baroo.backstage.summaries.loading"]()}</p>
        </div>
    {:else if timeline.length === 0}
        <div class="card empty-state">
            <p>{m["generic.list.no_items"]()}</p>
        </div>
    {:else}
        {#each timeline as event, i (i)}
            <div class="timeline-item" data-type={event.type}>
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                    {#if event.type === 'settlement'}
                        <article class="timeline-event settlement">
                            <header class="action-header">
                                <strong>{m["baroo.backstage.summaries.settled_event"]()}</strong>
                            </header>
                            <div class="amount">{m["baroo.backstage.summaries.due"]({ amountWithCurrency: renderer.formatCurrency("czk", event.data.amountDue) })}</div>
                            <div class="amount">{m["baroo.backstage.summaries.paid"]({ amountWithCurrency: renderer.formatCurrency("czk", event.data.amountPaid) })}</div>
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
