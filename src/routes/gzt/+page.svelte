<script lang="ts">
    import { page } from "$app/state";
    import Gzt from "$lib/eggs/Gzt.svelte";

    const debug = $derived(page.url.searchParams.get("debug") ?? "");
</script>

<svelte:head>
    <title>🦎</title>
    <link rel="icon" href="/assets/eggs/minicon.svg" type="image/svg+xml" />
</svelte:head>

<main class="lizard-page">
    <Gzt {debug} showMine />
</main>

<style lang="scss">
    .lizard-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;

        background-image: linear-gradient(160deg, #fafafa, #e8efe8);
        font-family: system-ui, sans-serif;

        :global(button) {
            border: 0;
            padding: 0;
            background-color: #fff;
            font: inherit;
            color: inherit;
            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }
    }
</style>
