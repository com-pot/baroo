<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";

    /**
     * Drops the service worker and its caches, then reloads.
     *
     * The escape hatch for the one failure the app cannot detect: a worker or a cached
     * asset that is wrong, where every reload just serves the wrong thing again. It
     * deliberately leaves IndexedDB alone — that is where unsynced orders live, and this
     * button exists to fix stale code, not to throw away the queue.
     */
    let { bar }: { bar: OfflineBar } = $props();

    let busy = $state(false);
    let error = $state<string>();

    async function reset() {
        // Clearing the precache offline leaves the tablet with nothing to reload from,
        // so the button is disabled — but a race with the connection can still land here.
        if (!bar.online) return;
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
        disabled={busy || !bar.online}
        onclick={reset}
    >
        {busy ? m["baroo.staff.cache_resetting"]() : m["baroo.staff.cache_reset"]()}
    </button>
</div>

{#if !bar.online}
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
