<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * A stack of {@link Accordion}s butted into one block.
     *
     * The cards keep their own border; the group collapses the doubled edge between
     * neighbours and rounds only its outer corners, so a stack reads as one control
     * rather than as loose cards that happen to sit near each other.
     */
    let { children }: { children: Snippet } = $props();
</script>

<div class="accordion-group">
    {@render children()}
</div>

<style lang="scss">
    // The children are `.accordion` cards rendered by the caller, so these rules have to
    // reach out of this component's scope.
    .accordion-group > :global(.accordion) {
        border-radius: 0;
    }

    .accordion-group > :global(.accordion + .accordion) {
        border-top: 0;
    }

    .accordion-group > :global(.accordion:first-child) {
        border-start-start-radius: var(--bs-card-border-radius, 0.375rem);
        border-start-end-radius: var(--bs-card-border-radius, 0.375rem);
    }

    .accordion-group > :global(.accordion:last-child) {
        border-end-start-radius: var(--bs-card-border-radius, 0.375rem);
        border-end-end-radius: var(--bs-card-border-radius, 0.375rem);
    }
</style>
