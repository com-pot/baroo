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
</script>

<div class="card info-card message-stream">
    <div class="card-header">
        <span class="icon">📡</span>
        <span class="title">{m["baroo.bar.stream"]()}</span>
    </div>
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
