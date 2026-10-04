<script lang="ts">
    import type { LayerComponentProps } from "$lib/ui/uiLayers.svelte";

    let {
        ctrl,
        heading,
        children,

        wrapperStyle,
        onClose,

        ...rest
    }: LayerComponentProps = $props()
</script>

<button class="drawer-overlay" tabindex="-1" onclick={() => onClose?.('backdrop')} aria-label="Close drawer"></button>
<aside class="drawer{rest.closing ? ' closing' : ''}" id={ctrl.id} style={wrapperStyle}
    ontransitionend={() => rest.closing && onClose?.("destroy")}
>
    <header class="drawer-header">
        {#if typeof heading === "string"}
        <h3>{heading}</h3>
        {:else if heading}
        <h3>{@render heading()}</h3>
        {/if}

        {#if onClose}
        <button
            type="button"
            class="btn-close"
            aria-label="Close"
            onclick={() => onClose?.('close')}
        ></button>
        {/if}

    </header>
    <div class="drawer-body">
        {@render children()}
    </div>
</aside>
