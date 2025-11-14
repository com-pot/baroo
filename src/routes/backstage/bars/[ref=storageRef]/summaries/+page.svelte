<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import { stringifyStorageRef } from '$lib/bar/refs';
    import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';

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
        loadTimeline(member.member.id);
    }

    function closeDrawer() {
        selectedMember = null;
        timeline = null;
        settlementAmount = 0;
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
    {:else}¨
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
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <aside class="drawer-overlay" onclick={closeDrawer}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="drawer" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
            <header class="drawer-header">
                <h2>{m["baroo.backstage.summaries.timeline_title"]({ nickName: selectedMember.member.nickName })}</h2>
                <button class="btn-close" onclick={closeDrawer} aria-label={m["baroo.backstage.summaries.close"]()}></button>
            </header>

            <div class="drawer-body">
                <div class="member-stats">
                    <div class="stat-item">
                        <span class="label">{m["baroo.backstage.summaries.settled_orders"]()}</span>
                        <span class="value">{selectedMember.standing.settledOrderItems} / {selectedMember.standing.totalOrderItems}</span>
                    </div>
                    <div class="stat-item" data-slots="2">
                        <div class="label">{m["baroo.backstage.summaries.amount_due"]()}</div>
                        <div class="value">{selectedMember.standing.amountDue.toFixed(2)} Kč</div>
                    </div>
                </div>

                <div class="settlement-form card">
                    <form method="POST" action="?/settleMember" use:enhance class="card-body">
                        <h3>{m["baroo.backstage.summaries.settle_tab"]()}</h3>
                        <input type="hidden" name="memberId" value={selectedMember.member.id} />
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
                                        <div class="timeline-event settlement">
                                            <strong>{m["baroo.backstage.summaries.settled_event"]()}</strong>
                                            <div class="amount">{m["baroo.backstage.summaries.due"]({ amountWithCurrency: (event.data.amountDue?.toFixed(2) || "0") + " Kč" })}</div>
                                            <div class="amount">{m["baroo.backstage.summaries.paid"]({ amountWithCurrency: (event.data.amountPaid?.toFixed(2) || "0") + " Kč" })}</div>
                                            <time>{formatDate(event.date)}</time>
                                        </div>
                                    {:else if event.type === 'order'}
                                        <div class="timeline-event order">
                                            <strong>{m["baroo.backstage.summaries.ordered_event"]()}</strong>
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
            left: calc(-1.5rem - 6px + 1px);
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
