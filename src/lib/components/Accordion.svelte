<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * One collapsible card in a stack of them.
     *
     * `<details>` rather than an open flag: the browser owns the toggle, and everything in
     * a stack sharing one `name` makes them mutually exclusive, so opening an operation
     * folds the previous one away without any bookkeeping here.
     */
    let {
        title,
        name,
        open = false,
        children,
    }: {
        title: string;
        /** Shared between siblings that should collapse each other. */
        name?: string;
        open?: boolean;
        children: Snippet;
    } = $props();
</script>

<details class="accordion card" {name} {open}>
    <summary>
        <h3>{title}</h3>
    </summary>
    <div class="card-body">
        {@render children()}
    </div>
</details>

<style lang="scss">
    .accordion {
        // A `details` is a block box by default; the card needs it to clip its own corners.
        overflow: hidden;
    }

    summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        user-select: none;
        background: #f8f9fa;

        // The default triangle sits outside the padding on Safari; draw our own instead.
        list-style: none;

        &::-webkit-details-marker {
            display: none;
        }

        &::before {
            content: "";
            flex-shrink: 0;
            width: 0.5rem;
            height: 0.5rem;
            border-right: 2px solid currentColor;
            border-bottom: 2px solid currentColor;
            transform: rotate(-45deg);
            transition: transform 0.15s ease-out;
        }
    }

    [open] > summary {
        border-bottom: 1px solid #dee2e6;

        &::before {
            transform: rotate(45deg);
        }
    }

    // Scoped to the summary so the drawer's own `h3` rule cannot outweigh it.
    summary h3 {
        margin: 0;
        font-size: 1.1rem;
    }
</style>
