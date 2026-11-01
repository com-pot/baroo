<script lang="ts">
    import { m } from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { untrack } from "svelte";
    import safeError from "$lib/ui/safeError.svelte";
    import SafeError from "$lib/components/SafeError.svelte";

    let { store }: { store: BarOfflineStore } = $props();

    let nickName = $state("");
    let seq = $state(untrack(() => store.nextMemberSeq));
    const error = safeError()

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        error.clear()

        await store.process("member-create", { nickName: nickName.trim(), memberSeq: seq })
            .then(() => nickName = "")
            .catch(error.catch)
    }
</script>

<SafeError {error} />

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
            bind:value={seq}
            required
        />
    </label>

    <button class="btn btn-primary" type="submit" disabled={!nickName.trim()}>
        {m["baroo.staff.member_submit"]()}
    </button>
</form>
