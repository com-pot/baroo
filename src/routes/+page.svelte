<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { readDevice } from '$lib/offline/idb';

    let checking = $state(true);

    onMount(async () => {
        try {
            const device = await readDevice();
            if (device) {
                await goto(`/bar/${device.bar.slug}`, { replaceState: true });
                return;
            }
        } catch {
            // Device not enrolled, stay at welcome page
        }
        checking = false;
    });
</script>

<main class="landing">
    <h1>Baroo</h1>
    {#if checking}
        <p>
            <span role="img">⏳</span>
            <span>{m["generic.loading"]()}</span>
        </p>
    {:else}
        <p>{m['baroo.welcome']()}</p>
        <p>
            <a data-sveltekit-preload-code="off" data-sveltekit-preload-data="off" href="/enroll">{m['baroo.enroll.title']()}</a>
        </p>
    {/if}
</main>

<style lang="scss">
.landing {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    justify-content: flex-start;
    align-items: center;
    padding: 1rem 0.25rem;

    width: 100vw; height: 100vh;
}
</style>
