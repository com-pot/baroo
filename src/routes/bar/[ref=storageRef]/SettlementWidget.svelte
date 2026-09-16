<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";

    /**
     * Closes a member's tab.
     *
     * What is owed is read off the local standing rather than typed, so the barman only
     * has to enter what actually changed hands — and cannot settle for less than the tab.
     */
    let {
        bar,
        member,
    }: {
        bar: Pick<OfflineBar, "summaries"|"process"|"standing"|"findMember">,
        member?: string,
    } = $props();

    const priceFormatter = new Intl.NumberFormat("cs", {
        style: "currency",
        currency: "czk",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    const orderedSummaries = $derived(bar.summaries.toSorted((a, b) => a.member.seq - b.member.seq))

    let memberId = $derived(member || "");
    let amountPaid = $state("");
    let error = $state<string | null>(null);

    const due = $derived(memberId ? bar.standing(memberId).amountDue : 0);

    const viewMode = $derived(member !== undefined ? 'settle-only' : 'full')

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error = null;
        console.log(memberId)

        const member = bar.findMember(memberId);
        if (!member) {
            error = m["baroo.staff.member_invalid"]()
            return;
        }

        const paid = parseFloat(amountPaid);
        if (isNaN(paid) || paid < due) {
            error = m["baroo.staff.settle_short"]();
            return;
        }

        await bar.process("settlement", {
            memberId: member.id,
            memberLabel: member.nickName,
            amountDue: due,
            amountPaid: paid,
        });

        memberId = "";
        amountPaid = "";
    }
</script>

{#if error}
<p class="alert alert-dismissible alert-danger">
    {error}
    <button type="button" class="btn-close" aria-label="Close" onclick={() => error = null}></button>
</p>
{/if}

<form class="inline-form" onsubmit={submit}>
    {#if viewMode === 'full'}
    <label>
        {m["baroo.staff.settle_member"]()}
        <select class="form-select" bind:value={memberId} required name="memberId">
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
        <output class="form-control-plaintext" name="due" >{priceFormatter.format(due)}</output>
    </label>
    {/if}

    <label>
        {m["baroo.staff.settle_paid"]()}
        <div class="input-group">
            <input class="form-control" name="amountPaid" type="number" step="0.01" min="0" bind:value={amountPaid} required />
            <div class="input-group-text">Kč</div>
        </div>
    </label>

    <button class="btn btn-primary" type="submit" disabled={!memberId}>
        {m["baroo.staff.settle_submit"]()}
    </button>
</form>
