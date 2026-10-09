<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const formatSeen = (at?: string) =>
        at ? new Date(at).toLocaleString() : m["baroo.devices.never"]();
</script>

<svelte:head>
    <title>{m["baroo.devices.title"]()}</title>
</svelte:head>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a> /
    <span>{m["baroo.devices.breadcrumb"]()}</span>
</nav>

<main class="page">
    <header class="page-header">
        <h1>{m["baroo.devices.title"]()}</h1>
    </header>

    {#if !data.devices.length}
        <div class="card card-body info-message">
            <p>{m["baroo.devices.none"]()}</p>
        </div>
    {:else}
        <table class="table">
            <thead>
                <tr>
                    <th>{m["baroo.devices.label"]()}</th>
                    <th>{m["baroo.devices.bar"]()}</th>
                    <th>{m["baroo.devices.kind"]()}</th>
                    <th>{m["baroo.devices.last_seen"]()}</th>
                    <th>{m["baroo.devices.enrolled_by"]()}</th>
                    <th>{m["baroo.devices.active"]()}</th>
                </tr>
            </thead>
            <tbody>
                {#each data.devices as device (device.id)}
                    <tr class:inactive={!device.active}>
                        <td>{device.label}</td>
                        <td>
                            <form method="POST" action="?/setBar" use:enhance>
                                <input type="hidden" name="deviceId" value={device.id} />
                                <select
                                    class="form-select form-select-sm"
                                    name="bar"
                                    onchange={(e) => e.currentTarget.form?.requestSubmit()}
                                >
                                    {#each data.bars as bar (bar.id)}
                                        <option value={bar.id} selected={bar.id === device.bar}>{bar.name}</option>
                                    {/each}
                                </select>
                            </form>
                        </td>
                        <td>
                            {device.kind === "staff"
                                ? m["baroo.enroll.kind_staff"]()
                                : m["baroo.enroll.kind_kiosk"]()}
                        </td>
                        <td>
                            {#if device.lastSeen}
                                {formatSeen(device.lastSeen)}
                            {:else}
                                <em>{m["baroo.backstage.pos.pending"]()}</em>
                            {/if}
                        </td>
                        <td>{device.expand?.enrolledBy?.name || device.expand?.enrolledBy?.email || "—"}</td>
                        <td>
                            <form method="POST" action="?/setActive" use:enhance>
                                <input type="hidden" name="deviceId" value={device.id} />
                                <input type="hidden" name="active" value={String(!device.active)} />
                                <button
                                    class="btn btn-sm"
                                    class:btn-outline-danger={device.active}
                                    class:btn-outline-success={!device.active}
                                    type="submit"
                                >
                                    {device.active
                                        ? m["baroo.devices.deactivate"]()
                                        : m["baroo.devices.activate"]()}
                                </button>
                            </form>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</main>

<style lang="scss">
    tr.inactive {
        opacity: 0.5;
    }
</style>
