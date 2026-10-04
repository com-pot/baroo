<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import safeError from "$lib/ui/safeError.svelte";
    import SafeError from "$lib/components/SafeError.svelte";

    let { store }: { store: BarOfflineStore } = $props();

    let serialId = $state("");
    let memberId = $state("");
    const error = safeError()

    const members = $derived(store.members.toSorted((a, b) => a.seq - b.seq));

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error.clear();

        const serial = serialId.trim();
        const member = store.findMember(memberId);

        if (!serial || !member) {
            error.set({ message: m["baroo.staff.tags_member_required"]() })
            return;
        }

        await store.process("tag-mapping", {
            serialId: serial,
            nickName: member.nickName,
            memberId: member.id,
        })
            .then(() => {
                serialId = "";
                memberId = "";
            })
            .catch(error.catch)
    }
</script>

{#if store.unknownTags.length}
    <div class="chips">
        {#each store.unknownTags as serial (serial)}
            <button
                type="button"
                class="btn btn-sm"
                class:btn-primary={serialId === serial}
                class:btn-outline-secondary={serialId !== serial}
                onclick={() => (serialId = serial)}
            >
                {serial}
            </button>
        {/each}
        <button type="button" class="btn btn-sm btn-outline-warning"
            onclick={() => { store.unknownTags = [] }}
        >✖️</button>
    </div>
{:else}
    <p class="text-meta">{m["baroo.staff.tags_empty"]()}</p>
{/if}

<SafeError {error} />

<form class="inline-form" onsubmit={submit}>
    <label>
        {m["baroo.backstage.mapper.serialId"]()}
        <input
            class="form-control"
            bind:value={serialId}
            placeholder={m["baroo.staff.tags_scan_hint"]()}
            required
        />
    </label>

    <label>
        {m["baroo.staff.tags_assign"]()}
        <select class="form-select" bind:value={memberId} required>
            <option value="" disabled>—</option>
            {#each members as member (member.id)}
                <option value={member.id}>{`${member.nickName} · #${member.seq ?? '-'}`}</option>
            {/each}
        </select>
    </label>

    <button class="btn btn-primary" type="submit" disabled={!memberId}>
        {m["baroo.staff.tags_save"]()}
    </button>
</form>

<style>
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-block-end: 0.75rem;
}
</style>
