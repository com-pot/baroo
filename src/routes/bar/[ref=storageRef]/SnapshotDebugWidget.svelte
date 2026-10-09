<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";

    /**
     * The raw snapshot, for when a derived view disagrees with what the server sent.
     *
     * A fullscreen dialog rather than another fold in the drawer: the offer alone is a
     * few hundred lines of JSON, and reading it inside 550px of drawer is not reading.
     * Each root key is a closed `<details>` — the point of the first screen is to spot
     * which key looks wrong (an empty `mappings`, a stale `capturedAt`) before opening it.
     */
    let { bar }: { bar: OfflineBar } = $props();

    let dialog = $state<HTMLDialogElement>();

    /** A one-line shape hint, so a key can be dismissed without unfolding it. */
    function describe(value: unknown): string {
        if (value === null || value === undefined) {
            return m["baroo.staff.snapshot_empty_value"]();
        }
        if (Array.isArray(value)) {
            return m["baroo.staff.snapshot_items"]({ count: String(value.length) });
        }
        if (typeof value === "object") {
            return m["baroo.staff.snapshot_keys"]({
                count: String(Object.keys(value).length),
            });
        }
        return String(value);
    }

    const sections = $derived.by(() =>
        Object.entries(bar.snapshot ?? {}).map(([key, value]) => ({
            key,
            summary: describe(value),
            json: JSON.stringify(value, null, 2),
        })),
    );
</script>

<div class="actions snapshot-actions">
    <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
        disabled={!bar.snapshot}
        onclick={() => dialog?.showModal()}
    >
        {m["baroo.staff.snapshot_open"]()}
    </button>
</div>

<dialog class="snapshot-debug" bind:this={dialog}>
    <header>
        <h3>{m["baroo.staff.snapshot_title"]()}</h3>
        <button type="button" class="btn btn-sm btn-secondary" onclick={() => dialog?.close()}>
            {m["baroo.staff.snapshot_close"]()}
        </button>
    </header>

    <div class="body">
        {#if !sections.length}
            <p class="meta">{m["baroo.staff.snapshot_missing"]()}</p>
        {:else}
            {#each sections as section (section.key)}
                <details>
                    <summary>
                        <span class="key">{section.key}</span>
                        <span class="hint">{section.summary}</span>
                    </summary>
                    <pre style="max-height: 60vh; overflow-y: auto;"><code>{section.json}</code></pre>
                </details>
            {/each}
        {/if}
    </div>
</dialog>

<style lang="scss">
    // Gap to the accordion below, which the drawer's shared `.actions` rule doesn't give.
    .snapshot-actions {
        margin-block-end: 0.5rem;
    }

    // Specific enough to outrank the kiosk's own centred, 35rem-wide `dialog` rules.
    dialog.snapshot-debug {
        // A modal `dialog` is centred by auto margins; zeroing them is what fills the
        // viewport once width and height are told to.
        position: fixed;
        inset: 0;
        margin: 0;
        padding: 0;
        max-width: none;
        min-width: 0;
        max-height: none;
        width: 100vw;
        height: 100dvh;
        border: none;
        background: #fff;
        color: #111827;
        display: none;
        flex-direction: column;

        &[open] {
            display: flex;
        }

        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid #dee2e6;
            background: #f8f9fa;

            h3 {
                margin: 0;
                font-size: 1.1rem;
            }
        }

        .body {
            flex: 1;
            // The dialog owns the viewport, so the scroll has to happen in here.
            overflow-y: auto;
            padding: 1rem 1.25rem 2rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        details {
            border: 1px solid rgb(0 0 0 / 0.1);
            border-radius: 0.5rem;
            overflow: hidden;
        }

        summary {
            display: flex;
            align-items: baseline;
            gap: 0.75rem;
            padding: 0.6rem 0.9rem;
            cursor: pointer;
            user-select: none;
            background: #f8f9fa;

            .key {
                font-family: monospace;
                font-weight: 600;
            }

            .hint {
                font-size: 0.85rem;
                opacity: 0.7;
            }
        }

        pre {
            margin: 0;
            padding: 0.9rem;
            // Long member ids and base64-ish filenames would otherwise widen the page
            // itself; the JSON scrolls inside its own box instead.
            overflow-x: auto;
            font-size: 0.8rem;
            line-height: 1.45;
            background: #fdfdfd;
            border-top: 1px solid rgb(0 0 0 / 0.08);
        }
    }
</style>
