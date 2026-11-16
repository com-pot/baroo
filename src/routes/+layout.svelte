<script lang="ts">
    import "$lib/assets/baroo.scss";
    import logo from "$lib/assets/baroo/Baroo-Logo01-BW.svg?raw";
    import { getLocale } from "$lib/paraglide/runtime.js";

    import { Renderer, setRenderer } from "$lib/rendering.svelte";
    import { setUiFeedback, UiFeedback } from "$lib/ui/uiFeedback.svelte";

    let { children } = $props();

    const renderer = setRenderer(new Renderer({
        get locale() { return getLocale() },
    }))
    const uiFeedback = setUiFeedback(new UiFeedback(renderer))
</script>

<div class="frame logo" style="aspect-ratio: 22.137 / 18.447;">
    {@html logo}
</div>

{@render children?.()}
