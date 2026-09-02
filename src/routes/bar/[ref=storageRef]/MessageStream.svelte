<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { copy } from '$lib/browser';
    import type { ScannerEventStream } from "./scannerEventStream.svelte";

    const {
        stream,
    }: {
        stream: ScannerEventStream,
    } = $props()

    const messagesParsed = $derived.by(() => stream.messages.map((text) => {
        if (text.startsWith("card:")) {
            const cardId = text.slice("card:".length)
            return { text, cardId }
        }

        return { text }
    }))

    let resetting = $state(false)
    let resetError = $state("")

    /**
     * The watchdog cannot see a PN532 that stopped polling while CCID keeps
     * answering — only the person looking at a dark LED can. This is their button.
     */
    async function resetReader() {
        resetting = true
        resetError = ""
        try {
            const response = await fetch("/bar/scanner-event-stream/reset", { method: "POST" })
            const body = await response.json().catch(() => ({}))
            if (!response.ok) {
                resetError = body.detail || String(response.status)
            }
        } catch (err) {
            resetError = err instanceof Error ? err.message : String(err)
        } finally {
            resetting = false
        }
    }
</script>

<div class="card info-card message-stream">
    <div class="card-header">
        <span class="icon">📡</span>
        <span class="title">{m["baroo.bar.stream"]()}</span>
        <button class="copy-btn" onclick={resetReader} disabled={resetting}>
            {m["baroo.bar.reset_reader"]()}
        </button>
    </div>
    {#if resetError}
        <p class="reset-error">{m["baroo.bar.reset_reader_failed"]({ detail: resetError })}</p>
    {/if}
    <div class="list-group">
        {#each messagesParsed as message, i (i)}
            <div class="list-group-item">
                <span class="message">{message.text}</span>
                {#if message.cardId}
                    <button class="copy-btn" onclick={() => copy(message.cardId)}>
                        {m["generic.action.copy"]()}
                    </button>
                {/if}
            </div>
        {/each}
    </div>
</div>

<style lang="scss">
    // The shared `.info-card` rules only style `.copy-btn` inside `.card-body`;
    // this one lives in the header, so it brings its own.
    .card-header .copy-btn {
        margin-inline-start: auto;
        padding: 0.25rem 0.5rem;
        background-color: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        font-size: 0.75rem;
        cursor: pointer;
        white-space: nowrap;

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .reset-error {
        margin: 0;
        padding: 0.25rem 0.5rem;
        color: #b91c1c;
        font-size: 0.75rem;
    }
</style>
