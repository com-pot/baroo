<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import Dialog from "$lib/components/Dialog.svelte";
    import { untrack } from "svelte";

    let { store }: { store: BarOfflineStore } = $props();
    let dialog = $state<Dialog>();

    const sections = $derived.by(() =>
        Object.entries(store.snapshot ?? {}).map(([key, value]) => ({
            key,
            json: JSON.stringify(value, null, 2),
        })),
    );
    let expanded = $state<string>(untrack(() => sections[0].key))
</script>

<button
    type="button"
    class="btn btn-outline-secondary btn-sm"
    disabled={!store.snapshot}
    onclick={() => dialog?.open()}
>
    {m["baroo.staff.snapshot_open"]()}
</button>

<Dialog
    bind:this={dialog}
    onOpen="noop"
    ctrl={{id: "snapshot-debug", close: () => dialog?.close()}}
>
    <div class="card snapshot-debug">
        <div class="card-header">
            <h3>{m["baroo.staff.snapshot_title"]()}</h3>
        </div>
        <div class="card-body">
            {#if !sections.length}
                <p class="text-meta">{m["baroo.staff.snapshot_missing"]()}</p>
            {:else}
                {@const section = sections.find((section) => section.key === expanded)}

                <ul class="nav nav-pills">
                    {#each sections as section (section.key)}
                        {@const active = expanded === section.key}
                        <li class="nav-item">
                            <button type="button"
                                class="nav-link"
                                class:active
                                aria-current={active ? 'page' : undefined}
                                onclick={() => expanded = section.key}
                            >{section.key}</button>
                        </li>
                    {/each}
                </ul>

                <div class="tab-pane">
                    {#if section}
                        <pre><code>{section.json}</code></pre>
                        {:else}
                        ---
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</Dialog>

<style lang="scss">
    :global(dialog:has(.snapshot-debug)) {
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
    }

    .snapshot-debug {
        &.card {
            width: 98vw;
            height: 100dvh;
            margin: 1rem auto;
        }

        .card-body {
            flex: 1;
            // The dialog owns the viewport, so the scroll has to happen in here.
            overflow-y: auto;
            padding: 1rem 1.25rem 2rem;

            pre {
                background-color: #eee;
            }
        }
    }

</style>
