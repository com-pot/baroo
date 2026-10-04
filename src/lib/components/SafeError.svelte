<script lang="ts">
import type safeError from "$lib/ui/safeError.svelte";

const {
    error,
}: {
    error: ReturnType<typeof safeError>,
} = $props()
</script>

{#if error.value}
<p class="alert alert-dismissible alert-danger">
    {error.value.message}
    <button type="button" class="btn-close" aria-label="Close" onclick={error.clear}></button>
</p>
{/if}
