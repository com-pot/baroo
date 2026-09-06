<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";

    /**
     * Closes a member's tab.
     *
     * What is owed is read off the local standing rather than typed, so the barman only
     * has to enter what actually changed hands — and cannot settle for less than the tab.
     */
    let { bar }: { bar: OfflineBar } = $props();
    const store = bar;

    const priceFormatter = new Intl.NumberFormat("cs", {
        style: "currency",
        currency: "czk",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    const orderedSummaries = $derived(store.summaries.toSorted((a, b) => a.member.seq - b.member.seq))

    let memberId = $state("");
    let amountPaid = $state("");
    let error = $state<string | null>(null);

    const due = $derived(memberId ? store.standing(memberId).amountDue : 0);

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error = null;

        const member = store.findMember(memberId);
        if (!member) return;

        const paid = parseFloat(amountPaid);
        if (isNaN(paid) || paid < due) {
            error = m["baroo.staff.settle_short"]();
            return;
        }

        await store.process("settlement", {
            memberId: member.id,
            memberLabel: member.nickName,
            amountDue: due,
            amountPaid: paid,
        });

        memberId = "";
        amountPaid = "";
    }
</script>

{#if error}<p class="alert alert-danger">{error}</p>{/if}

<form class="inline-form" onsubmit={submit}>
    <label>
        {m["baroo.staff.settle_member"]()}
        <select class="form-select" bind:value={memberId} required>
            <option value="" disabled>—</option>
            {#each orderedSummaries as summary (summary.member.id)}
                <option value={summary.member.id}>
                    {summary.member.seq} - {summary.member.nickName}
                </option>
            {/each}
        </select>
    </label>

    <label>
        {m["baroo.staff.settle_due"]()}
        <output class="form-control-plaintext">{priceFormatter.format(due)}</output>
    </label>

    <label>
        {m["baroo.staff.settle_paid"]()}
        <input class="form-control" type="number" step="0.01" min="0" bind:value={amountPaid} required />
    </label>

    <button class="btn btn-primary" type="submit" disabled={!memberId}>
        {m["baroo.staff.settle_submit"]()}
    </button>
</form>
