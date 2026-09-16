<script lang="ts">
import Drawer from "$lib/components/Drawer.svelte";
import type { UiLayerManager } from "./uiLayers.svelte";

const {
    layerManager,
}: {
    layerManager: UiLayerManager,
} = $props()

</script>

{#each layerManager.layers as layer (layer.id)}
<Drawer
    bind:isOpen={() => true, (open) => open || layerManager.close(layer.id)}
    heading={layer.heading}
>
    <layer.component {...layer.props} />
</Drawer>
{/each}
