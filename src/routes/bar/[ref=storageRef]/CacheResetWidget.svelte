<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";

    let {
        isOnline,
    }: {
        isOnline: () => boolean,
    } = $props();

    let busy = $state(false);
    let error = $state<string>();

    async function reset() {
        // Clearing the precache offline leaves the tablet with nothing to reload from,
        // so the button is disabled — but a race with the connection can still land here.
        if (!isOnline()) return;
        if (!confirm(m["baroo.staff.cache_reset_confirm"]())) return;

        busy = true;
        error = undefined;

        try {
            if (typeof caches !== "undefined") {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => caches.delete(key)));
            }

            // Unregistering is what makes this survive a broken worker: without it the old
            // worker keeps serving, and SvelteKit registers a fresh one on the next load.
            const registrations = await navigator.serviceWorker?.getRegistrations();
            await Promise.all((registrations ?? []).map((reg) => reg.unregister()));

            location.reload();
        } catch (err) {
            busy = false;
            error = m["baroo.staff.cache_reset_failed"]({
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
</script>

<div class="actions cache-reset-actions">
    <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        disabled={busy || !isOnline()}
        onclick={reset}
    >
        {busy ? m["baroo.staff.cache_resetting"]() : m["baroo.staff.cache_reset"]()}
    </button>
</div>

{#if !isOnline()}
    <p class="meta">{m["baroo.staff.cache_reset_offline"]()}</p>
{/if}

{#if error}
    <p class="alert alert-danger">{error}</p>
{/if}

<style lang="scss">
    // Matches the gap the snapshot widget above leaves to the accordion below.
    .cache-reset-actions {
        margin-block-end: 0.5rem;
    }
</style>
