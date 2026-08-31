<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageData } from "./$types";
    import { GREETING_NAME_TOKEN, POS_THEMES } from "$lib/pos/device";

    let { data }: { data: PageData } = $props();

    /** Which device's settings are expanded. One at a time keeps the table readable. */
    let configuring = $state<string | null>(null);
    /** Live copy of the open row's template, so the greeting hint reacts before saving. */
    let draftTemplate = $state('');

    function openConfig(device: PageData["devices"][number]) {
        configuring = device.id;
        draftTemplate = device.config.greetingTemplate;
    }

    const narrationOff = $derived(!draftTemplate.trim());

    const formatSeen = (at?: string) =>
        at ? new Date(at).toLocaleString() : m["baroo.devices.never"]();
</script>

<svelte:head>
    <title>{m["baroo.backstage.pos.title"]()}</title>
</svelte:head>

<main class="backstage-content" data-page="bar.pos">
    <header class="page-header">
        <h1>{m["baroo.backstage.pos.title"]()}</h1>
        <div class="actions">
            <a class="btn btn-outline-secondary" href="/bar/{data.ref}" target="_blank">
                {m["baroo.backstage.bar.kiosek"]()}
            </a>
            <a class="btn btn-primary" href="/enroll?bar={data.ref}">
                {m["baroo.backstage.pos.enroll_device"]()}
            </a>
        </div>
    </header>

    {#if !data.devices.length}
        <div class="card card-body info-message">
            <p>{m["baroo.backstage.pos.none"]()}</p>
        </div>
    {:else}
        <table class="table">
            <thead>
                <tr>
                    <th>{m["baroo.devices.label"]()}</th>
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
                            {device.kind === "staff"
                                ? m["baroo.enroll.kind_staff"]()
                                : m["baroo.enroll.kind_kiosk"]()}
                        </td>
                        <td>{formatSeen(device.lastSeen)}</td>
                        <td>{(device as any).expand?.enrolledBy?.name || (device as any).expand?.enrolledBy?.email || "—"}</td>
                        <td>
                            <div class="actions">
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary"
                                    aria-expanded={configuring === device.id}
                                    onclick={() => (configuring === device.id ? (configuring = null) : openConfig(device))}
                                >
                                    {m["baroo.backstage.pos.configure"]()}
                                </button>
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
                            </div>
                        </td>
                    </tr>
                    {#if configuring === device.id}
                        <tr class="config-row">
                            <td colspan="5">
                                <form
                                    method="POST"
                                    action="?/saveConfig"
                                    class="device-config"
                                    use:enhance={() => async ({ update }) => {
                                        await update({ reset: false });
                                        configuring = null;
                                    }}
                                >
                                    <input type="hidden" name="deviceId" value={device.id} />

                                    <div class="input-pair">
                                        <label class="form-label" for="theme-{device.id}">
                                            {m["baroo.backstage.pos.theme"]()}
                                        </label>
                                        <select
                                            class="form-select form-select-sm"
                                            id="theme-{device.id}"
                                            name="theme"
                                        >
                                            {#each POS_THEMES as theme (theme)}
                                                <option value={theme} selected={theme === device.config.theme}>
                                                    {theme}
                                                </option>
                                            {/each}
                                        </select>
                                    </div>

                                    <div class="form-check">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id="genZToy-{device.id}"
                                            name="genZToy"
                                            checked={device.config.genZToy}
                                        />
                                        <label class="form-check-label" for="genZToy-{device.id}">
                                            {m["baroo.backstage.pos.gen_z_toy"]()}
                                            <small>{m["baroo.backstage.pos.gen_z_toy_help"]()}</small>
                                        </label>
                                    </div>

                                    <div class="form-check">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id="idInput-{device.id}"
                                            name="idInput"
                                            checked={device.config.idInput}
                                        />
                                        <label class="form-check-label" for="idInput-{device.id}">
                                            {m["baroo.backstage.pos.id_input"]()}
                                            <small>{m["baroo.backstage.pos.id_input_help"]()}</small>
                                        </label>
                                    </div>

                                    <div class="input-pair greeting">
                                        <label class="form-label" for="greetingTemplate-{device.id}">
                                            {m["baroo.backstage.pos.greeting_template"]()}
                                        </label>
                                        <input
                                            class="form-control form-control-sm"
                                            type="text"
                                            id="greetingTemplate-{device.id}"
                                            name="greetingTemplate"
                                            bind:value={draftTemplate}
                                            placeholder={`Ave ${GREETING_NAME_TOKEN}`}
                                        />
                                        <small>{m["baroo.backstage.pos.greeting_template_help"]({ token: GREETING_NAME_TOKEN })}</small>
                                    </div>

                                    <!-- Stays enabled even when moot: disabling it would drop it
                                         from the form and silently save it as off. -->
                                    <div class="form-check" class:moot={narrationOff}>
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            id="customGreetings-{device.id}"
                                            name="customGreetings"
                                            checked={device.config.customGreetings}
                                        />
                                        <label class="form-check-label" for="customGreetings-{device.id}">
                                            {m["baroo.backstage.pos.custom_greetings"]()}
                                            <small>
                                                {narrationOff
                                                    ? m["baroo.backstage.pos.narration_off"]()
                                                    : m["baroo.backstage.pos.custom_greetings_help"]()}
                                            </small>
                                        </label>
                                    </div>

                                    <div class="actions">
                                        <button type="submit" class="btn btn-sm btn-primary">
                                            {m["baroo.backstage.pos.save_config"]()}
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-sm btn-secondary"
                                            onclick={() => (configuring = null)}
                                        >
                                            {m["baroo.backstage.offer.cancel"]()}
                                        </button>
                                    </div>
                                </form>
                            </td>
                        </tr>
                    {/if}
                {/each}
            </tbody>
        </table>
    {/if}
</main>

<style lang="scss">
    tr.inactive {
        opacity: 0.5;
    }

    .device-config {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 1rem 1.5rem;
        padding: 0.5rem 0;

        .form-check {
            margin: 0;
        }

        .form-check-label small {
            display: block;
            color: #666;
        }

        .form-check.moot {
            opacity: 0.6;
        }

        .greeting {
            flex: 1 1 20rem;

            small {
                display: block;
                color: #666;
            }
        }

        .actions {
            margin-inline-start: auto;
        }
    }
</style>
