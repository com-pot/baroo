<script lang="ts">
import * as m from '$lib/paraglide/messages.js';

import type { MemberSummaryEntry, MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import { aggregateMemberOrders } from '$lib/bar/stats/memberOrderOverview';
import type { Bar, BarOfferItem } from '$lib/bar/BarModel';
import TimelineMemberHistory from './TimelineMemberHistory.svelte';
import ProfileBadge from './ProfileBadge.svelte';
import type { Snippet } from 'svelte';
import { getRenderer } from '$lib/rendering.svelte';

const renderer = getRenderer()

const {
    bar,
    summary,
    timeline,
    barOffer,

    settlementFormSnippet,
}: {
    bar: Pick<Bar, "currency">,
    summary: MemberSummaryEntry,
    timeline: MemberTimelineEntry[],
    barOffer: Record<string, BarOfferItem>,

    settlementFormSnippet?: Snippet<[MemberSummaryEntry]>,
} = $props()

let showProfileBadgeStats = $state<boolean|null>(null)
const profileBadgeStats = $derived(typeof showProfileBadgeStats === "boolean" ? aggregateMemberOrders(timeline, barOffer) : null)

function saveProfileBadgeImg() {
    const badgeElement = document.querySelector('.profile-badge') as HTMLElement;
    if (!badgeElement) {
        console.error("Profile badge element not found.");
        return;
    }

    import('html-to-image').then(({ toPng }) => {
        toPng(badgeElement, { cacheBust: true })
            .then((dataUrl) => {
                const link = document.createElement('a');
                link.download = `${summary.member.nickName}-badge.png`;
                link.href = dataUrl;
                link.click();
            })
            .catch((error) => {
                console.error('Error generating image:', error);
            });
    });
}

</script>

<div class="flow-block member-summary-cards">
    <div class="card">
        <div class="card-header">
            <h3>{summary.member.nickName}</h3>
            <div class="actions">
                {#if showProfileBadgeStats}
                <button type="button" class="btn btn-sm btn-outline-primary" onclick={saveProfileBadgeImg}>📸</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick={() => showProfileBadgeStats = false}>✖️</button>
                {:else}
                <button type="button" class="btn btn-sm btn-outline-primary" onclick={() => showProfileBadgeStats = true}>📊</button>
                {/if}
            </div>
        </div>
        {#if showProfileBadgeStats && profileBadgeStats}
        <div class="card-body">
            <ProfileBadge member={summary.member} stats={profileBadgeStats}>
                {#snippet header()}
                    <div class="badge-header">
                        <span>{summary.member.nickName}</span>
                    </div>
                {/snippet}
                {#snippet footer()}
                <div class="badge-footer">
                    <img src="/assets/eggs/minicon.svg" alt="">
                    <span>2025</span>
                </div>
                {/snippet}
            </ProfileBadge>
        </div>
        {/if}
    </div>

    <div class="stats">
        <div class="card card-stat">
            <span class="label">{m["baroo.backstage.summaries.settled_orders"]()}</span>
            <span class="value">{summary.standing.totalOrderItems - summary.standing.pendingOrderItems} / {summary.standing.totalOrderItems}</span>
        </div>
        <div class="card card-stat" data-slots="2">
            <div class="label">{m["baroo.backstage.summaries.amount_due"]()}</div>
            <div class="value">{renderer.formatCurrency(bar.currency, summary.standing.amountDue)}</div>
        </div>
    </div>

    {#if settlementFormSnippet}
    <div class="card">
        {@render settlementFormSnippet(summary)}
    </div>
    {/if}

    <TimelineMemberHistory bar={bar} timeline={timeline!} />
</div>

<style lang="scss">
.badge-header {
    grid-row: 1;
    grid-column: 1 / span 2;
    place-self: start;
    font-size: 3rem;
    font-family: var(--font-not-jam-old-style);

    display: flex;
    flex-direction: column;
    line-height: 1;

    small {
        align-self: start;

        padding: 0.05em 0.2em;
        border-radius: calc(10px * var(--scale));
        font-size: 0.5em;
        color: var(--rank-color, gray);
        background-color: whitesmoke;
        border: 2px solid var(--rank-color, gray);
    }

    &[data-rank="1"] { --rank-color: rgb(255, 183, 0); }
    &[data-rank="2"] { --rank-color: rgb(153, 153, 153); }
    &[data-rank="3"] { --rank-color: hsl(0 82% 78% / 1) }
}
.badge-footer {
    grid-row: 1;
    grid-column: 1 / span 2;
    place-self: end start;

    display: flex;
    flex-direction: column;


    img {
        width: 10ch;
    }
    span {
        align-self: end;
        font-family: var(--font-not-jam-old-style);
        font-size: 3rem;
        line-height: 0.5;
    }

}

:global(.member-summary-cards .timeline) {
    margin-block-start: unset;
}
</style>
