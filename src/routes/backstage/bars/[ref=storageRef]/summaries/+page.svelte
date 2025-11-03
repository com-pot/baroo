<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import { stringifyStorageRef } from '$lib/bar/refs';
    import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let selectedMember = $state<typeof data.summaries[0] | null>(null);
    let timeline = $state<MemberTimelineEntry[]>([]);
    let settlementAmount = $state('');

    function openMemberDetail(member: typeof data.summaries[0]) {
        selectedMember = member;
        loadTimeline(member.member.id);
    }

    function closeDrawer() {
        selectedMember = null;
        timeline = [];
        settlementAmount = '';
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

    function formatDate(dateStr: Date|string) {
        console.log(dateStr)
        const date = new Date(dateStr);
        return date.toLocaleString('cs-CZ', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
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
    <a href="/backstage/bars">Bars</a> /
    <a href="/backstage/bars/{data.ref.key}">{data.bar?.name}</a> /
    Summaries
</nav>

<main class="backstage-content" data-page="bar.summaries">
    <header class="page-header">
        <h1>Member Summaries</h1>
        <div class="actions">
            <a href="/backstage/bars/{data.ref.key}" class="btn btn-secondary">Back to Dashboard</a>
        </div>
    </header>

    {#if data.summaries.length === 0}
        <div class="empty-state">
            <p>No members found. Add members to your bar to see summaries.</p>
        </div>
    {:else}¨
        <div class="card">
            <div class="card-body">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th class="text-end">Total Orders</th>
                            <th class="text-end">Settled</th>
                            <th class="text-end">Pending</th>
                            <th class="text-end">Last Settlement</th>
                            <th class="text-end">Status</th>
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
                                    <strong>{summary.member.nickName}</strong>
                                    <small class="text-muted">#{summary.member.seq}</small>
                                </td>
                                <td class="text-end">{summary.totalOrderItems}</td>
                                <td class="text-end">{summary.settledOrderItems}</td>
                                <td class="text-end">
                                    <span class:text-warning={summary.pendingOrderItems > 0}>
                                        {summary.pendingOrderItems}
                                    </span>
                                </td>
                                <td class="text-end">
                                    {#if summary.lastSettlement}
                                        <div>
                                            <small>{formatDate(summary.lastSettlement.date)}</small>
                                            <div class="text-success">
                                                {summary.lastSettlement.amountPaid.toFixed(2)} Kč
                                            </div>
                                        </div>
                                    {:else}
                                        <em class="text-muted">Never</em>
                                    {/if}
                                </td>
                                <td class="text-end">
                                    {#if summary.pendingOrderItems === 0}
                                        <span class="badge bg-success">Settled</span>
                                    {:else}
                                        <span class="badge bg-warning">Pending</span>
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
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <aside class="drawer-overlay" onclick={closeDrawer}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="drawer" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
            <header class="drawer-header">
                <h2>{selectedMember.member.nickName} - Timeline</h2>
                <button class="btn-close" onclick={closeDrawer} aria-label="Close"></button>
            </header>

            <div class="drawer-body">
                <div class="member-stats">
                    <div class="stat-item">
                        <span class="label">Total Orders</span>
                        <span class="value">{selectedMember.totalOrderItems}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Settled</span>
                        <span class="value text-success">{selectedMember.settledOrderItems}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Pending</span>
                        <span class="value text-warning">{selectedMember.pendingOrderItems}</span>
                    </div>
                </div>

                <div class="settlement-form card">
                    <form method="POST" action="?/settleMember" use:enhance class="card-body">
                        <h3>Settle Tab</h3>
                        <input type="hidden" name="memberId" value={selectedMember.member.id} />
                        <div class="input-group">
                            <input
                                type="number"
                                name="amountPaid"
                                class="form-control"
                                placeholder="Amount paid"
                                step="0.01"
                                min="0.01"
                                required
                                bind:value={settlementAmount}
                            />
                            <span class="input-group-text">Kč</span>
                            <button type="submit" class="btn btn-primary">Settle</button>
                        </div>
                    </form>
                </div>

                <div class="timeline">
                    {#if timeline.length === 0}
                        <div class="empty-state">
                            <p>Loading timeline...</p>
                        </div>
                    {:else}
                        {#each timeline as event (event.date)}
                            <div class="timeline-item" data-type={event.type}>
                                <div class="timeline-marker"></div>
                                <div class="timeline-content">
                                    {#if event.type === 'settlement'}
                                        <div class="timeline-event settlement">
                                            <strong>Settled tab</strong>
                                            <div class="amount">Paid {event.data.amountPaid?.toFixed(2)} Kč</div>
                                            <time>{formatDate(event.date)}</time>
                                        </div>
                                    {:else if event.type === 'order'}
                                        <div class="timeline-event order">
                                            <strong>Ordered</strong>
                                            <div class="order-detail">
                                                "{event.data.key}" ({event.data.variant})
                                            </div>
                                            <time>{formatDate(event.date)}</time>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    </aside>
{/if}

<style lang="scss">
    .clickable {
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
            background-color: rgba(0, 0, 0, 0.05);
        }
    }

    .drawer-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .drawer {
        background: white;
        width: 100%;
        max-width: 600px;
        height: 100%;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .drawer-header {
        padding: 1.5rem;
        border-bottom: 1px solid #dee2e6;
        display: flex;
        align-items: center;
        justify-content: space-between;

        h2 {
            margin: 0;
            font-size: 1.5rem;
        }
    }

    .drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
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
        }
    }

    .settlement-form {
        margin-bottom: 2rem;

        h3 {
            font-size: 1.125rem;
            margin-bottom: 1rem;
        }
    }

    .timeline {
        position: relative;
        padding-left: 2rem;

        &::before {
            content: '';
            position: absolute;
            left: 0.5rem;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #dee2e6;
        }
    }

    .timeline-item {
        position: relative;
        margin-bottom: 2rem;

        .timeline-marker {
            position: absolute;
            left: -1.5rem;
            top: 0.5rem;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: white;
            border: 2px solid #dee2e6;
        }

        &[data-type="settlement"] .timeline-marker {
            border-color: #28a745;
            background: #28a745;
        }

        &[data-type="order"] .timeline-marker {
            border-color: #007bff;
            background: #007bff;
        }
    }

    .timeline-content {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 8px;
        border-left: 3px solid transparent;

        .timeline-event.settlement {
            border-left-color: #28a745;

            .amount {
                color: #28a745;
                font-weight: bold;
                margin: 0.5rem 0;
            }
        }

        .timeline-event.order {
            border-left-color: #007bff;

            .order-detail {
                color: #495057;
                margin: 0.5rem 0;
            }
        }

        strong {
            display: block;
            color: #212529;
            font-size: 1rem;
        }

        time {
            display: block;
            font-size: 0.875rem;
            color: #6c757d;
            margin-top: 0.5rem;
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
</style>
