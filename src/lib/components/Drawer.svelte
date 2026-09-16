<script lang="ts">
    import { onMount, type Snippet } from "svelte";

    let {
        isOpen = $bindable(false),
        heading,
        children,
    }: {
        isOpen?: boolean,
        heading?: Snippet | string,
        children: Snippet
    } = $props()

    onMount(() => {
        $inspect({
            isOpen,
            heading,
            children,
        })
    })
</script>

<aside class="drawer">
    <header class="drawer-header">
        {#if typeof heading === "string"}
        <h3>{heading}</h3>
        {:else if heading}
        <h3>{@render heading()}</h3>
        {/if}
        <button
            type="button"
            class="btn-close"
            aria-label="Close"
            onclick={() => isOpen = false}
        ></button>
    </header>
    <div class="drawer-body">
        {@render children()}
    </div>
</aside>
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" onclick={() => isOpen = false}></div>
