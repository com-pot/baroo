<script lang="ts">
import Drawer from "$lib/components/Drawer.svelte";
import { type LayerComponent as LayerComponentType, type UiLayerManager } from "./uiLayers.svelte";

const {
    layerManager,
    scope = 'default',
    component,
}: {
    layerManager: UiLayerManager,
    scope?: string,
    component?: LayerComponentType,
} = $props()

const activeScope = $derived.by((): typeof layerManager.scopes[string] => {
    const activeScope = layerManager.scopes[scope]
    if (!activeScope) {
        console.warn("Unknown layer scope", { scope })
        return { layers: [], closing: {} }
    }
    return activeScope
})

const visibleLayers = $derived.by(() => {
    const result = Array.from<[typeof activeScope.layers[number], number]>({ length: activeScope.layers.length })

    let depth = 0
    for (let i = activeScope.layers.length - 1; i >= 0; i--) {
        result[i] = [activeScope.layers[i], depth]
        if (!activeScope.closing[i]) depth++
    }

    return result
})

const LayerComponent = $derived.by((): LayerComponentType => component || Drawer)
</script>

<div class="layer-stack" data-scope={scope}>
{#each visibleLayers as [layer, depth] (layer.id)}
<LayerComponent
    ctrl={layer.ctrl}
    heading={layer.heading}
    wrapperStyle={`--depth:${depth};`}

    closing={activeScope.closing[layer.id]}
    onClose={(target) => {
        if (target === 'destroy') {
            layerManager.destroy(layer.id, scope)
            return
        }

        layerManager.close(layer.id, scope)
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
</LayerComponent>
{/each}
</div>
