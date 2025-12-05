<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import { stringifyStorageRef } from '$lib/bar/refs';
    import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
    import Drawer from '$lib/components/Drawer.svelte';
    import TimelineMemberHistory from './TimelineMemberHistory.svelte';
    import { aggregateMemberOrders } from '$lib/bar/stats/memberOrderOverview';
    import ProfileBadge from './ProfileBadge.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let selectedMember = $state<typeof data.summaries[0] | null>(null);
    let timeline = $state<MemberTimelineEntry[] | null>(null);
    let settlementAmount = $state(0);
    let toDue = $derived.by(() => {
        if (!selectedMember?.standing.amountDue) return null

        return selectedMember.standing.amountDue - settlementAmount;
    })

    function openMemberDetail(member: typeof data.summaries[0]) {
        selectedMember = member;
        return loadTimeline(member.member.id);
    }

    function closeDrawer() {
        selectedMember = null;
        timeline = null;
        settlementAmount = 0;
        profileBadgeStats = null;
    }

    let profileBadgeStats = $state<null|ReturnType<typeof aggregateMemberOrders>>(null)
    function showProfileBadge() {
        if (!selectedMember || !timeline) {
            console.error("No selected member to show profile badge for.");
            return;
        }
        console.log(selectedMember)
        profileBadgeStats = aggregateMemberOrders(timeline, data.barOffer)
    }
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
                    link.download = `${selectedMember!.member.nickName}-badge.png`;
                    link.href = dataUrl;
                    link.click();
                })
                .catch((error) => {
                    console.error('Error generating image:', error);
                });
        });
    }

    async function loadTimeline(memberId: string) {
        const formData = new FormData();
        formData.append('memberId', memberId);

        const response = await fetch(`/api/bars/${stringifyStorageRef(data.ref)}/member/${memberId}/timeline`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
        });

        const result = await response.json();
        timeline = result || [];
    }

    onMount(() => {
        // @ts-ignore
        import("bootstrap/dist/js/bootstrap.bundle.min.js");
    });

    $effect(() => {
        if (form?.success && form.action === 'settleMember') {
            if (selectedMember) {
                loadTimeline(selectedMember.member.id);
            }
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
    });
</script>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a> /
    <a href="/backstage/bars/{data.ref.key}">{data.bar?.name}</a> /
    {m["baroo.backstage.summaries.breadcrumb"]()}
</nav>

<main class="backstage-content" data-page="bar.summaries">
    <header class="page-header">
        <h1>{m["baroo.backstage.summaries.title"]()}</h1>
        <div class="actions">
            <a href="/backstage/bars/{data.ref.key}" class="btn btn-secondary">{m["baroo.backstage.summaries.back_to_dashboard"]()}</a>
        </div>
    </header>

    {#if data.summaries.length === 0}
        <div class="empty-state">
            <p>{m["baroo.backstage.summaries.no_members"]()}</p>
        </div>
    {:else}
        <div class="card">
            <div class="card-body">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>{m["baroo.backstage.summaries.member"]()}</th>
                            <th class="text-end">{m["baroo.backstage.summaries.settled"]()}</th>
                            <th class="text-end">{m["baroo.backstage.summaries.amount_due"]()}</th>
                            <th class="text-end">{m["baroo.backstage.summaries.status"]()}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.summaries as summary (summary.member.id)}
                            <tr
                                class="clickable"
                                onclick={() => openMemberDetail(summary)}
                                role="button"
                                tabindex="0"
                            >
                                <td>
                                    <small class="text-muted">#{summary.member.seq}</small>
                                    <strong>{summary.member.nickName}</strong>
                                </td>
                                <td class="text-end">{summary.standing.settledOrderItems} / {summary.standing.totalOrderItems}</td>
                                <td class="text-end">
                                    <strong class:text-muted={summary.standing.amountDue <= 0}>
                                        {summary.standing.amountDue.toFixed(2)} Kč
                                    </strong>
                                </td>
                                <td class="text-end">
                                    {#if summary.standing.pendingOrderItems === 0}
                                        <span class="badge bg-success">{m["baroo.backstage.summaries.status_settled"]()}</span>
                                    {:else}
                                        <span class="badge bg-warning">{m["baroo.backstage.summaries.status_pending"]()}</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</main>

{#if selectedMember}
    <Drawer bind:isOpen={() => selectedMember !== null, (value) => value || closeDrawer()}>
        {#snippet heading()}{m["baroo.backstage.summaries.timeline_title"]({ nickName: selectedMember!.member.nickName })}{/snippet}
        {#snippet children()}
                <div class="member-stats">
                    <div class="stat-item">
                        <span class="label">{m["baroo.backstage.summaries.settled_orders"]()}</span>
                        <span class="value">{selectedMember!.standing.settledOrderItems} / {selectedMember!.standing.totalOrderItems}</span>
                    </div>
                    <div class="stat-item" data-slots="2">
                        <div class="label">{m["baroo.backstage.summaries.amount_due"]()}</div>
                        <div class="value">{selectedMember!.standing.amountDue.toFixed(2)} Kč</div>
                    </div>
                </div>

                <div class="settlement-form card">
                    <form method="POST" action="?/settleMember" use:enhance class="card-body">
                        <h3>{m["baroo.backstage.summaries.settle_tab"]()}</h3>
                        <input type="hidden" name="memberId" value={selectedMember!.member.id} />
                        <div class="input-group">
                            <input
                                type="number"
                                name="amountPaid"
                                class="form-control"
                                placeholder={m["baroo.backstage.summaries.amount_paid"]()}
                                step="1"
                                min="0"
                                required
                                bind:value={settlementAmount}
                            />
                            <span class="input-group-text">Kč</span>
                            <button type="submit" class="btn btn-primary">{m["baroo.backstage.summaries.settle"]()}</button>
                        </div>
                        {#if toDue === null}
                            <p>{m["baroo.backstage.settlement.nada"]()}</p>
                        {:else if toDue > 0}
                            <p>{m["baroo.backstage.settlement.due"]({ amountWithCurrency: toDue.toFixed(2) + ' Kč' })}</p>
                        {:else}
                            <p>{m["baroo.backstage.settlement.toReturn"]({ amountWithCurrency: (-toDue).toFixed(2) + ' Kč' })}</p>
                        {/if}

                        {#if form?.error}
                            <div class="alert alert-danger mt-2">{form.error}</div>
                        {/if}
                    </form>
                </div>
            {#if profileBadgeStats}
            <div class=" card">
                <div class="card-header">
                    <h3>{selectedMember!.member.nickName}</h3>
                    <div class="actions">
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick={saveProfileBadgeImg}>📸</button>
                    </div>
                </div>
                <div class="card-body">
                    <ProfileBadge member={selectedMember!.member} stats={profileBadgeStats}>
                        {#snippet header()}
                            <div class="badge-header" data-rank={selectedMember!.topRank}>
                                <span>{selectedMember!.member.nickName}</span>
                                {#if selectedMember!.topRank}<small>{selectedMember!.topRank}. největší pijan</small>{/if}
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
            </div>
            {/if}
            <TimelineMemberHistory timeline={timeline!} {showProfileBadge} />
        {/snippet}
    </Drawer>
{/if}

<style lang="scss">
    .clickable {
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
            background-color: rgba(0, 0, 0, 0.05);
        }
    }

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

    .settlement-form {
        margin-bottom: 2rem;

        h3 {
            font-size: 1.125rem;
            margin-bottom: 1rem;
        }
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #6c757d;

        p {
            margin: 0;
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
