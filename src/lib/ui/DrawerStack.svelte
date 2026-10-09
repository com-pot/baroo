<script lang="ts">
import Drawer from "$lib/components/Drawer.svelte";
import { type UiLayerManager } from "./uiLayers.svelte";

const {
    layerManager,
}: {
    layerManager: UiLayerManager,
} = $props()

const visibleLayers = $derived.by(() => {
    const arr = layerManager.layers
    const result = Array.from<[typeof arr[number], number]>({ length: arr.length })

    let visible = 0
    for (let i = arr.length - 1; i >= 0; i--) {
        result[i] = [arr[i], visible]
        if (!layerManager.closing[i]) visible++
    }

    return result
})

</script>

<div class="drawer-stack">
{#each visibleLayers as [layer, below], i (layer.id)}
{@const closingStyle = layerManager.closing[i] ? ' --closing: 1;' : ''}
<Drawer
    heading={layer.heading}
    drawerStyle={`--below: ${below};${closingStyle}`}

    onClose={(trigger) => {
        layerManager.close(layer.id)
    }}
    ontransitionend={(e) => {
        if (!layerManager.closing[i]) return

        // The drawer may have elements within it with transitions. Close only when the drawer
        //   itself finishes transitioning
        if (e.target instanceof HTMLElement && e.target.localName === 'aside') {
            layerManager.destroy(layer.id)
        }
    }}
>
    {#if layer.type === 'component'}
    <layer.component {...layer.props} />
    {:else if layer.type === 'snippet'}
    {@render layer.snippet(layer.arg)}
    {:else}
    <div class="alert alert-danger">
        Unknown layer type
        <code><pre>{layer}</pre></code>
    </div>
    {/if}
</Drawer>
{/each}
</div>
