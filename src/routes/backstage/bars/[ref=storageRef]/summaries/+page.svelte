<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { onMount, type ComponentProps } from 'svelte';
    import type { MemberSummary, MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
    import type { MemberImportIssue } from '$lib/bar/memberImport';
    import { getUiLayers, type UiComponentLayer, type UiLayerCtrl } from '$lib/ui/uiLayers.svelte';
    import MemberSummaryCards from './MemberSummaryCards.svelte';

    const uiLayers = getUiLayers()

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let memberDetailLayer = $state<UiComponentLayer<ComponentProps<typeof MemberSummaryCards>>|null>(null)
    let settlementAmount = $state(0);
    let toDue = $derived.by(() => {
        const summary = memberDetailLayer?.props.summary
        if (!summary?.standing.amountDue) return null

        return summary.standing.amountDue - settlementAmount;
    })
    async function openMemberDetail(summary: MemberSummary) {
        const timeline = await loadTimeline(summary.member.id)

        memberDetailLayer = uiLayers.pushComponent(MemberSummaryCards, {
            barOffer: data.barOffer,
            summary,
            timeline,

            settlementFormSnippet,
        }, {
            heading: m["baroo.backstage.summaries.timeline_title"]({ nickName: summary.member.nickName }),
            onDestroyed: () => { memberDetailLayer = null }
        })
    }

    async function loadTimeline(memberId: string) {
        const formData = new FormData();
        formData.append('memberId', memberId);

        const response = await fetch(`/api/bars/${data.ref}/member/${memberId}/timeline`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
        });

        const result = await response.json();
        return (result || []) as MemberTimelineEntry[]
    }

    onMount(() => {
        // @ts-ignore
        import("bootstrap/dist/js/bootstrap.bundle.min.js");
    });

    let importText = $state('');
    let importPending = $state(false);
    /**
     * The rejected rows of the last submit, kept out of `form` on purpose: an import that
     * fails must not put an error into the member drawer that shares this page's `form`.
     */
    let importIssues = $state<MemberImportIssue[] | null>(null);
    let importPartial = $state<{ created: number; renamed: number } | null>(null);
    let importResult = $state<{ created: number; renamed: number; unchanged: number } | null>(null);

    let importLayerCtrl = $state<UiLayerCtrl | null>(null)
    function openImport() {
        if (importLayerCtrl) {
            console.warn("Import already open")
            return
        }

        importIssues = null;
        importPartial = null;
        importResult = null;

        importLayerCtrl = uiLayers.pushSnippet(importMembersSnippet, undefined, {
            heading: m["baroo.backstage.summaries.import.drawer_title"](),
            onDestroyed: () => {
                importLayerCtrl = null
            },
        }).ctrl
    }

    /** Back from the error report to the paste that produced it, still in the textarea. */
    function resumeEditing() {
        importIssues = null;
        importPartial = null;
    }

    const submitImport: SubmitFunction = () => {
        importPending = true;

        return async ({ result, update }) => {
            importPending = false;

            if (result.type === 'failure') {
                const data = result.data as { issues?: MemberImportIssue[]; created?: number; renamed?: number } | undefined;
                importIssues = data?.issues ?? [];
                importPartial = data?.created || data?.renamed
                    ? { created: data.created ?? 0, renamed: data.renamed ?? 0 }
                    : null;
                return;
            }

            if (result.type === 'success') {
                const data = result.data as { created: number; renamed: number; unchanged: number };
                importResult = { created: data.created, renamed: data.renamed, unchanged: data.unchanged };
                importIssues = null;
                importPartial = null;
                importText = '';
            }

            // Reloads the member list from the server, which is what makes the new names show.
            await update({ reset: false });
        };
    };

    /** Reasons come back as codes so the page, not the action, owns the wording. */
    function issueText(reason: MemberImportIssue['reason']): string {
        switch (reason.code) {
            case 'format': return m["baroo.backstage.summaries.import.reason_format"]();
            case 'invalid_seq': return m["baroo.backstage.summaries.import.reason_invalid_seq"]({ value: reason.value });
            case 'duplicate_seq': return m["baroo.backstage.summaries.import.reason_duplicate_seq"]({ seq: String(reason.seq) });
            case 'duplicate_name': return m["baroo.backstage.summaries.import.reason_duplicate_name"]({ nickName: reason.nickName });
            case 'name_taken': return m["baroo.backstage.summaries.import.reason_name_taken"]({ nickName: reason.nickName, seq: String(reason.seq) });
            case 'write_failed': return m["baroo.backstage.summaries.import.reason_write_failed"]({ message: reason.message });
        }
    }
</script>

<main class="backstage-content" data-page="bar.summaries">
    <header class="page-header">
        <h1>{m["baroo.backstage.summaries.title"]()}</h1>
        <div class="actions">
            <button type="button" class="btn btn-primary" onclick={openImport}>{m["baroo.backstage.summaries.import.action"]()}</button>
            <a href="/backstage/bars/{data.ref}/mapper" class="btn btn-outline-secondary">{m["baroo.backstage.bar.member_mapping"]()}</a>
        </div>
    </header>

    {#if importResult}
        <div class="alert alert-success">
            {m["baroo.backstage.summaries.import.result"]({
                created: String(importResult.created),
                renamed: String(importResult.renamed),
                unchanged: String(importResult.unchanged),
            })}
        </div>
    {/if}

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

{#snippet settlementFormSnippet(summary: MemberSummary)}
<form method="POST" action="?/settleMember" use:enhance={() => {
    return async ({ update }) => {
        await update()

        const timeline = await loadTimeline(summary.member.id)
        if (memberDetailLayer && timeline) {
            memberDetailLayer.props = { ...memberDetailLayer.props, timeline }
        }
    }
}} class="card-body">
    <h3>{m["baroo.backstage.summaries.settle_tab"]()}</h3>
    <input type="hidden" name="memberId" value={summary!.member.id} />
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
{/snippet}

{#snippet importMembersSnippet()}
    <form method="POST" action="?/importMembers" use:enhance={submitImport} class="member-import">
        {#if importIssues}
            <div class="alert alert-danger">
                {#if importIssues.length === 0}
                    <p>{m["baroo.backstage.summaries.import.nothing"]()}</p>
                {:else}
                    <strong>{m["baroo.backstage.summaries.import.errors_title"]({ count: String(importIssues.length) })}</strong>
                    <p>{m["baroo.backstage.summaries.import.errors_intro"]()}</p>
                {/if}
                {#if importPartial}
                    <p>{m["baroo.backstage.summaries.import.partial"]({
                        created: String(importPartial.created),
                        renamed: String(importPartial.renamed),
                    })}</p>
                {/if}
            </div>

            <ul class="issues">
                {#each importIssues as issue (issue.lineNo)}
                    <li>
                        <span class="line-no">{issue.lineNo}</span>
                        <code>{issue.raw}</code>
                        <span class="reason">{issueText(issue.reason)}</span>
                    </li>
                {/each}
            </ul>

            <!-- The paste never left `importText`, so going back lands on it unchanged. -->
            <div class="form-actions">
                <button type="button" class="btn btn-outline-secondary" onclick={resumeEditing}>
                    {m["baroo.backstage.summaries.import.back"]()}
                </button>
            </div>
        {:else}
            <label class="form-label" for="members">{m["baroo.backstage.summaries.import.data_label"]()}</label>
            <textarea
                id="members"
                name="members"
                class="form-control"
                rows="5"
                spellcheck="false"
                bind:value={importText}
                required
            ></textarea>
            <p class="form-text">{m["baroo.backstage.summaries.import.data_hint"]()}</p>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary" disabled={importPending}>
                    {importPending
                        ? m["baroo.backstage.summaries.import.submitting"]()
                        : m["baroo.backstage.summaries.import.submit"]()}
                </button>
            </div>
        {/if}
    </form>
{/snippet}

<style lang="scss">
    .clickable {
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
            background-color: rgba(0, 0, 0, 0.05);
        }
    }

    .member-import {
        .form-actions {
            margin-top: 1rem;
            display: flex;
            justify-content: flex-end;
        }

        .issues {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;

            li {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 0.25rem 0.5rem;
                padding: 0.5rem 0.75rem;
                border-left: 3px solid #dc3545;
                background: #f8f9fa;
            }

            .line-no {
                font-variant-numeric: tabular-nums;
                color: #6c757d;
            }

            code {
                /* A pasted row can be wide; it must not push the drawer sideways. */
                overflow-x: auto;
                white-space: pre;
            }

            .reason {
                grid-column: 2;
                font-size: 0.875rem;
                color: #842029;
            }
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
