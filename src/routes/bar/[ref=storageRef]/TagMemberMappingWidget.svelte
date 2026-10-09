<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";

    let { bar: store }: { bar: OfflineBar } = $props();

    let serialId = $state("");
    let memberId = $state("");
    let error = $state<string | null>(null);

    const members = $derived(store.members.toSorted((a, b) => a.seq - b.seq));

    const memberLabel = (member: { seq: number; nickName: string }) =>
        member.seq ? `#${member.seq} · ${member.nickName}` : member.nickName;

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error = null;

        const serial = serialId.trim();
        const member = store.findMember(memberId);

        if (!serial || !member) {
            error = m["baroo.staff.tags_member_required"]();
            return;
        }

        await store.process("tag-mapping", {
            serialId: serial,
            nickName: member.nickName,
            memberId: member.id,
        });

        serialId = "";
        memberId = "";
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
    <p class="meta">{m["baroo.staff.tags_empty"]()}</p>
{/if}

{#if error}<p class="alert alert-danger">{error}</p>{/if}

<form class="inline-form" onsubmit={submit}>
    <label>
        {m["baroo.backstage.mapper.nfc_tag"]()}
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
                <option value={member.id}>{memberLabel(member)}</option>
            {/each}
        </select>
    </label>

    <button class="btn btn-primary" type="submit" disabled={!memberId}>
        {m["baroo.staff.tags_save"]()}
    </button>
</form>
