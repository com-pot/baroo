<script lang="ts">
    import type { ValidationError } from "$lib/validation/validator";

    const {
        error,
    }: {
        error?: string | ValidationError[] | null,
    } = $props()
</script>

{#if typeof error === "string"}
    <span class="error-message">{error}</span>
{:else if Array.isArray(error)}
    {#each error as error, i (i)}
        <span class="error-message" data-field={error.field}>{error.message}</span>
    {/each}
{/if}
