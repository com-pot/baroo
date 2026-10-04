<script lang="ts">
import * as m from "$lib/paraglide/messages";
import type { LayerComponentProps } from "$lib/ui/uiLayers.svelte";
import { onMount } from "svelte";

const {
    ctrl,
    children,

    closing,
    onClose,
    ...rest
}: LayerComponentProps = $props()

let dialogEl = $state<HTMLDialogElement>()

onMount(() => {
    dialogEl!.showModal()
})

</script>

<dialog
    onclose={(ev) => {
        onClose?.("close")
        // When the display goes `none`, the transition is cancelled
        ev.currentTarget.addEventListener("transitioncancel", () => {
            onClose?.("destroy")
        }, {once: true})
    }}
    class="{closing ? 'closing' : ''}" id={ctrl.id} style={rest.wrapperStyle}
    bind:this={dialogEl}
    ontransitionend={() => {
        closing && onClose?.("destroy")
    }}
>
    <button
        data-action="close"
        aria-label={m["generic.close"]()}
        tabindex="-1"
        onclick={() => dialogEl?.close()}
    >
            <span role="img">✖</span>
        </button
    >
    {@render children()}
</dialog>
