<script lang="ts">
    import "$lib/assets/baroo.scss";
    import { getLocale } from "$lib/paraglide/runtime.js";

    import { Renderer, setRenderer } from "$lib/rendering.svelte";
    import { setUiFeedback, UiFeedback } from "$lib/ui/uiFeedback.svelte";

    let { children } = $props();

    const renderer = setRenderer(new Renderer({
        get locale() { return getLocale() },
    }))
    const uiFeedback = setUiFeedback(new UiFeedback(renderer))
</script>

{@render children?.()}
