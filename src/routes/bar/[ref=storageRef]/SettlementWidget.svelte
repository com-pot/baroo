<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { getRenderer } from "$lib/rendering.svelte";
    import safeError from "$lib/ui/safeError.svelte";
    import SafeError from "$lib/components/SafeError.svelte";

    const renderer = getRenderer()

    let {
        store,
        member,
    }: {
        store: Pick<BarOfflineStore, "summaries"|"process"|"standing"|"findMember"|"currency">,
        member?: string,
    } = $props();

    const orderedSummaries = $derived(store.summaries.toSorted((a, b) => a.member.seq - b.member.seq))

    let memberId = $derived(member || "");
    let amountPaid = $state(0);
    const error = safeError()

    const amountDue = $derived(memberId ? store.standing(memberId).amountDue : 0);

    const viewMode = $derived(member !== undefined ? 'settle-only' : 'full')

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error.clear()

        const member = store.findMember(memberId);
        if (!member) {
            error.set({ message: m["baroo.staff.member_invalid"]() })
            return;
        }

        await store.process("settlement", {
            memberId: member.id,
            memberLabel: member.nickName,
            amountDue: amountDue,
            amountPaid,
        })
            .then(() => {
                memberId = "";
                amountPaid = 0;
            })
            .catch(error.catch)
    }
</script>

<SafeError {error} />

<form class="inline-form" onsubmit={submit}>
    {#if viewMode === 'full'}
    <label>
        {m["baroo.settlement.member"]()}
        <select class="form-select" bind:value={memberId} required name="memberId">
            <option value="" disabled>—</option>
            {#each orderedSummaries as summary (summary.member.id)}
                <option value={summary.member.id}>{summary.member.seq} - {summary.member.nickName}</option>
            {/each}
        </select>
    </label>

    <label>
        {m["baroo.settlement.amountDue"]()}
        <output class="form-control-plaintext" name="amountDue" >{renderer.formatCurrency(store.currency, amountDue)}</output>
    </label>
    {/if}

    <label>
        {m["baroo.settlement.amountPaid"]()}
        <div class="input-group">
            <input class="form-control" name="amountPaid" type="number" step="0.01" min="0" bind:value={amountPaid} required />
            <div class="input-group-text">{renderer.currencySymbol(store.currency)}</div>
        </div>
    </label>

    <button class="btn btn-primary" type="submit" disabled={!memberId}>
        {m["baroo.settlement.submit"]()}
    </button>
</form>
