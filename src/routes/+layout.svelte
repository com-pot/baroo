<script lang="ts">
    import "$lib/assets/baroo.scss";
    import { getLocale } from "$lib/paraglide/runtime.js";

    import { Renderer, setRenderer } from "$lib/rendering.svelte";

    let { children } = $props();

    const renderer = setRenderer(new Renderer({
        get locale() { return getLocale() },
    }))
</script>

{@render children?.()}
