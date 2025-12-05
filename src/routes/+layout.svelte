<script lang="ts">
    import "$lib/assets/baroo.scss";
    import { getLocale } from "$lib/paraglide/runtime.js";

    import favicon from '$lib/assets/favicon.svg';
    import { Renderer, setRenderer } from "$lib/rendering.svelte";

    let { children } = $props();

    const renderer = setRenderer(new Renderer({
        get locale() { return getLocale() },
    }))
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
