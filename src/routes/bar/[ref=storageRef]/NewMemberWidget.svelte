<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";

    let { store }: { store: BarOfflineStore } = $props();

    let nickName = $state("");
    let seqInput = $state("");
    let seqTouched = $state(false);
    let error = $state<string | null>(null);

    const suggestedSeq = $derived(store.nextMemberSeq);

    $effect(() => {
        if (!seqTouched) seqInput = String(suggestedSeq);
    });

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error = null;

        const name = nickName.trim();
        const seq = Number(seqInput);

        if (!name || !Number.isInteger(seq) || seq < 1) {
            error = m["baroo.staff.member_invalid"]();
            return;
        }

        if (store.members.some((member) => member.nickName === name)) {
            error = m["baroo.staff.member_duplicate"]({ nickName: name });
            return;
        }

        if (store.findMemberBySeq(seq)) {
            error = m["baroo.staff.member_seq_taken"]({ seq: String(seq) });
            return;
        }

        await store.process("member-create", { nickName: name, memberSeq: seq });

        nickName = "";
        seqTouched = false;
    }
</script>

{#if error}<p class="alert alert-danger">{error}</p>{/if}

<form class="inline-form" onsubmit={submit}>
    <label>
        {m["baroo.staff.member_nickname"]()}
        <input class="form-control" bind:value={nickName} required />
    </label>

    <label>
        {m["baroo.staff.member_seq"]()}
        <input
            class="form-control"
            type="number"
            min="1"
            step="1"
            bind:value={seqInput}
            oninput={() => (seqTouched = true)}
            required
        />
    </label>

    <button class="btn btn-primary" type="submit" disabled={!nickName.trim()}>
        {m["baroo.staff.member_submit"]()}
    </button>
</form>
