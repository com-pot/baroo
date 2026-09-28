<script lang="ts">
import * as m from '$lib/paraglide/messages.js';

import type { MemberSummary, MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import { aggregateMemberOrders } from '$lib/bar/stats/memberOrderOverview';
import type { BarOfferItem } from '$lib/bar/BarModel';
import TimelineMemberHistory from './TimelineMemberHistory.svelte';
import ProfileBadge from './ProfileBadge.svelte';
    import type { Snippet } from 'svelte';

const {
    summary,
    timeline,
    barOffer,

    settlementFormSnippet,
}: {
    summary: MemberSummary,
    timeline: MemberTimelineEntry[],
    barOffer: Record<string, BarOfferItem>,

    settlementFormSnippet?: Snippet<[MemberSummary]>,
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
                link.download = `${summary!.member.nickName}-badge.png`;
                link.href = dataUrl;
                link.click();
            })
            .catch((error) => {
                console.error('Error generating image:', error);
            });
    });
}

</script>

<div class="member-stats">
    <div class="stat-item">
        <span class="label">{m["baroo.backstage.summaries.settled_orders"]()}</span>
        <span class="value">{summary.standing.settledOrderItems} / {summary.standing.totalOrderItems}</span>
    </div>
    <div class="stat-item" data-slots="2">
        <div class="label">{m["baroo.backstage.summaries.amount_due"]()}</div>
        <div class="value">{summary.standing.amountDue.toFixed(2)} Kč</div>
    </div>
</div>

{#if settlementFormSnippet}
<div class="card">
    {@render settlementFormSnippet(summary)}
</div>
{/if}

<div class="card">
    <div class="card-header">
        <h3>{summary!.member.nickName}</h3>
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
        <ProfileBadge member={summary!.member} stats={profileBadgeStats}>
            {#snippet header()}
                <div class="badge-header" data-rank={summary!.topRank}>
                    <span>{summary!.member.nickName}</span>
                    {#if summary!.topRank}<small>{summary!.topRank}. největší pijan</small>{/if}
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

<TimelineMemberHistory timeline={timeline!} />

<style lang="scss">
.member-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;

    .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem;
        background: #f8f9fa;
        border-radius: 8px;

        .label {
            font-size: 0.875rem;
            color: #6c757d;
            margin-bottom: 0.5rem;
        }

        .value {
            font-size: 1.5rem;
            font-weight: bold;
        }

        &[data-slots="2"] {
            grid-column: span 2;
        }
    }
}
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
</style>
