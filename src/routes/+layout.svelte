<script lang="ts">
    import "$lib/assets/baroo.scss";
    import logo from "$lib/assets/baroo/Baroo-Logo01-BW.svg?raw";
    import { getLocale } from "$lib/paraglide/runtime.js";

    import { Renderer, setRenderer } from "$lib/rendering.svelte";
    import LayerStack from "$lib/ui/LayerStack.svelte";
    import Dialog from "$lib/components/Dialog.svelte";
    import { setUiFeedback, UiFeedback } from "$lib/ui/uiFeedback.svelte";
    import { setUiLayers, UiLayerManager } from "$lib/ui/uiLayers.svelte";

    let { children } = $props();

    const renderer = setRenderer(new Renderer({
        get locale() { return getLocale() },
    }))
    const uiFeedback = setUiFeedback(new UiFeedback(renderer))
    const layerManager = setUiLayers(new UiLayerManager(['dialog']))
</script>

<div class="frame logo" style="aspect-ratio: 22.137 / 18.447;">
    {@html logo}
</div>

{@render children?.()}

<LayerStack layerManager={layerManager} />
<LayerStack layerManager={layerManager} scope="dialog" component={Dialog} />
