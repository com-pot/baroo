<script lang="ts">
    import { Narrator } from "$lib/speech.svelte";
    import { onMount } from "svelte";

    const narrator = new Narrator()
    onMount(() => {
        narrator.init()
    })

    const voices = $derived.by(() => narrator.voices.toSorted((a, b) => {
        return a.lang.localeCompare(b.lang)
            || a.name.localeCompare(b.name)
    }))

    const exclusions = $state({
        langs: [] as string[],
        voices: [] as string[],
    })
    function isExcluded(key: keyof typeof exclusions, value: string) {
        return exclusions[key].includes(value)
    }
    function toggleExclusion(key: keyof typeof exclusions, value: string) {
        const position = exclusions[key].indexOf(value)
        if (position === -1) {
            exclusions[key].push(value)
        } else {
            exclusions[key].splice(position, 1)
        }
    }

    let utterance = $state("Nazdar bazar!")
</script>

<div class="wrapper" style="max-height: 40vh; overflow-y: auto;">
<table class="table">
    <thead>
        <tr>
            <th>Speak</th>
            <th>Lang</th>
            <th>Name</th>
        </tr>
    </thead>
    <tbody>
        {#each voices as voice (voice.lang + ":" + voice.name)}
        {@const exclVoice = isExcluded('langs', voice.lang)}
        {@const exclLang = isExcluded('voices', voice.lang + ":" + voice.name)}
            <tr>
                <td>
                    <button
                        onclick={() => narrator.speak(utterance, voice.name)}
                    >🗣️</button>
                </td>
                <td data-excluded={exclVoice}>
                    <button onclick={() => toggleExclusion('langs', voice.lang)}></button>
                    <span>{voice.lang}</span>
                </td>
                <td data-excluded={exclLang}>
                    <button onclick={() => toggleExclusion('voices', voice.lang + ":" + voice.name)}></button>
                    <span>{voice.name}</span>
                </td>
            </tr>
        {/each}
    </tbody>
</table>
</div>
<code>
    <pre>{JSON.stringify(exclusions, null, 2)}</pre>
</code>

<style lang="scss">
    [data-excluded] {
        --btn-text: "↩️";
        button::after {
            content: var(--btn-text);
        }
    }
    [data-excluded="false"] {
        --btn-text: "❌";
    }

    .table td[data-excluded="true"] {
        opacity: 0.4;
    }
    .table td button {
        width: 1em;
        height: 1em;
        margin-right: 0.5em;
        vertical-align: middle;
        border: 1px solid var(--color-text);
        background-color: transparent;
        cursor: pointer;
    }
    .table td button::after {
        display: block;
        width: 0.6em;
        height: 0.6em;
        margin: auto;
        background-color: var(--color-text);
    }
    .table td[data-excluded="true"] button::after {
        background-color: transparent;
    }
</style>
