<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageData } from "./$types";
    import { resolve } from "$app/paths";
    import { getRenderer } from "$lib/rendering.svelte";

    const renderer = getRenderer()

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{m["baroo.devices.title"]()}</title>
</svelte:head>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a> /
    <span>{m["baroo.devices.breadcrumb"]()}</span>
</nav>

<main class="backstage-content">
    <header class="page-header">
        <h1>{m["baroo.devices.title"]()}</h1>
    </header>

    <table class="table">
        <thead>
            <tr>
                <th>{m["baroo.devices.label"]()}</th>
                <th>{m["baroo.devices.bar"]()}</th>
                <th>{m["baroo.devices.kind"]()}</th>
                <th>{m["baroo.devices.lastSeen"]()}</th>
                <th>{m["baroo.devices.enrolled_by"]()}</th>
                <th>{m["baroo.devices.active"]()}</th>
            </tr>
        </thead>
        <tbody>
            {#each data.devices as device (device.id)}
                {@const bar = data.bars.find((bar) => bar.id === device.bar)}
                <tr class:inactive={!device.active}>
                    <td>{device.label}</td>
                    <td>
                        {#if bar}
                            <a href={resolve("/backstage/bars/[ref=storageRef]/pos", {ref: bar?.slug})}>{bar.name}</a>
                        {:else}
                            <span>{device.bar}</span>
                        {/if}
                    </td>
                    <td>
                        {m[`baroo.pos.kind.${device.kind}`]()}
                    </td>
                    <td>
                        {#if device.lastSeen}
                            {renderer.formatDate(device.lastSeen)}
                        {:else}
                            <em>{m["baroo.backstage.pos.pending"]()}</em>
                        {/if}
                    </td>
                    <td>{device.expand?.enrolledBy?.name || device.expand?.enrolledBy?.email || "—"}</td>
                    <td>
                        {#if device.active}
                            <span class="badge bg-success">{m["generic.bool.yes"]()}</span>
                        {:else}
                            <span class="badge bg-secondary">{m["generic.bool.no"]()}</span>
                        {/if}
                    </td>
                </tr>
            {:else}
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <p>{m["baroo.devices.none"]()}</p>
                        </div>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</main>

<style lang="scss">
    tr.inactive {
        opacity: 0.5;
    }
</style>
