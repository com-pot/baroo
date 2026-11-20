<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import logo from "$lib/assets/baroo/Baroo-Logotyp01-Colored.svg?raw";
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { readDevice } from '$lib/offline/idb';
    import BuildInfo from '$lib/components/BuildInfo.svelte';

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
    <h1 class="brand">
        <span class="visually-hidden">Baroo</span>
        <div role="presentation">
            {@html logo}
        </div>
    </h1>
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

<footer>
    <BuildInfo />
</footer>

<style lang="scss">
.landing {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    justify-content: flex-start;
    align-items: center;
    padding: 1rem 0.25rem;

    width: 100vw; height: 100vh;

    + footer {
        position: fixed;
        z-index: 3;
        bottom: 0rem;
        left: 50%;
        translate: -50% 0;
    }
}
</style>
