<script lang="ts">
    import { onMount, type Snippet } from "svelte";

    let {
        heading,
        children,

        drawerStyle,
        onClose,

        ...rest
    }: {
        heading?: Snippet | string,
        children: Snippet,

        drawerStyle?: string,

        onClose?: (trigger: 'backdrop' | 'close') => unknown,

        ontransitionend?: HTMLElement["ontransitionend"],
    } = $props()

    // onMount(() => {
    //     $inspect({
    //         heading,
    //         children,
    //     })
    // })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" onclick={() => onClose?.('backdrop')}></div>
<aside class="drawer" style={drawerStyle}
    ontransitionend={rest.ontransitionend}>
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
