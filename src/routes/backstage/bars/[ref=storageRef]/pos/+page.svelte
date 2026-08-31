<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageData, ActionData } from "./$types";
    import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
    import { DEFAULT_POS_CONFIG } from "$lib/pos/device";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /** Which device's settings are expanded. One at a time keeps the table readable. */
    let configuring = $state<string | null>(null);
    /** Whether the create panel is open. */
    let creating = $state(false);

    const errorMessages: Record<string, () => string> = {
        "pairing-unavailable": m["baroo.backstage.pos.pairing_unavailable"],
        "device-in-use": m["baroo.backstage.pos.device_in_use"],
        "missing-fields": m["baroo.backstage.pos.missing_fields"],
    };

    const formError = $derived(
        form && "error" in form && form.error ? String(form.error) : null,
    );

    const canPair = $derived(data.pairing.status === "ready");

    /** Nag a month out: a lapsed token also stops paired tablets rotating their own. */
    const TOKEN_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

    const tokenExpiringOn = $derived.by(() => {
        if (!canPair || !data.pairing.tokenExpiresAt) return null;

        const at = Date.parse(data.pairing.tokenExpiresAt);

        return at - Date.now() < TOKEN_WARNING_MS ? new Date(at).toLocaleDateString() : null;
    });

    const formatSeen = (at?: string) =>
        at ? new Date(at).toLocaleString() : m["baroo.devices.never"]();

    const formatExpiry = (at?: string) =>
        at ? new Date(at).toLocaleTimeString() : "";
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
            <button
                class="btn btn-primary"
                type="button"
                aria-expanded={creating}
                disabled={!canPair}
                onclick={() => (creating = !creating)}
            >
                {m["baroo.backstage.pos.create_device"]()}
            </button>
        </div>
    </header>

    {#if formError}
        <p class="alert alert-danger" role="alert">
            {(errorMessages[formError] ?? (() => formError))()}
        </p>
    {/if}

    {#if data.pairing.status === "missing"}
        <p class="alert alert-warning" role="status">
            {m["baroo.backstage.pos.pairing_unavailable"]()}
        </p>
    {:else if data.pairing.status === "expired"}
        <p class="alert alert-warning" role="status">
            {m["baroo.backstage.pos.pairing_token_expired"]()}
        </p>
    {:else if tokenExpiringOn}
        <p class="alert alert-warning" role="status">
            {m["baroo.backstage.pos.pairing_token_expiring"]({ date: tokenExpiringOn })}
        </p>
    {/if}

    {#if creating}
        <div class="card card-body create-device">
            <h2>{m["baroo.backstage.pos.create_title"]()}</h2>

            <form
                method="POST"
                action="?/createDevice"
                class="flow-block"
                use:enhance={() => async ({ update }) => {
                    await update();
                    creating = false;
                }}
            >
                <div class="input-pair">
                    <label class="form-label" for="new-label">{m["baroo.enroll.label"]()}</label>
                    <input
                        class="form-control"
                        id="new-label"
                        name="label"
                        required
                        placeholder={m["baroo.enroll.label_placeholder"]()}
                    />
                </div>

                <fieldset>
                    <legend class="form-label">{m["baroo.enroll.kind"]()}</legend>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="kind" id="new-kind-kiosk" value="kiosk" checked />
                        <label class="form-check-label" for="new-kind-kiosk">{m["baroo.enroll.kind_kiosk"]()}</label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="kind" id="new-kind-staff" value="staff" />
                        <label class="form-check-label" for="new-kind-staff">{m["baroo.enroll.kind_staff"]()}</label>
                    </div>
                </fieldset>

                <fieldset>
                    <legend class="form-label">{m["baroo.backstage.pos.config_legend"]()}</legend>
                    <PosConfigFields config={DEFAULT_POS_CONFIG} idSuffix="new" />
                </fieldset>

                <div class="actions">
                    <button class="btn btn-primary" type="submit">
                        {m["baroo.backstage.pos.create_submit"]()}
                    </button>
                    <button class="btn btn-secondary" type="button" onclick={() => (creating = false)}>
                        {m["baroo.backstage.offer.cancel"]()}
                    </button>
                </div>
            </form>
        </div>
    {/if}

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
                        <td>
                            {#if device.lastSeen}
                                {formatSeen(device.lastSeen)}
                            {:else}
                                <em>{m["baroo.backstage.pos.pending"]()}</em>
                            {/if}
                        </td>
                        <td>{device.expand?.enrolledBy?.name || device.expand?.enrolledBy?.email || "—"}</td>
                        <td>
                            <!-- A device that has checked in keeps its full controls even while a
                                 fresh code is outstanding; one that never has can only be re-coded
                                 or thrown away. -->
                            <div class="actions">
                                {#if device.lastSeen}
                                    <button
                                        type="button"
                                        class="btn btn-sm btn-outline-secondary"
                                        aria-expanded={configuring === device.id}
                                        onclick={() => (configuring = configuring === device.id ? null : device.id)}
                                    >
                                        {m["baroo.backstage.pos.configure"]()}
                                    </button>
                                    <form method="POST" action="?/regenerateCode" use:enhance>
                                        <input type="hidden" name="deviceId" value={device.id} />
                                        <button
                                            class="btn btn-sm btn-outline-secondary"
                                            type="submit"
                                            disabled={!canPair}
                                        >
                                            {m["baroo.backstage.pos.pair_again"]()}
                                        </button>
                                    </form>
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
                                {:else}
                                    <form method="POST" action="?/regenerateCode" use:enhance>
                                        <input type="hidden" name="deviceId" value={device.id} />
                                        <button
                                            class="btn btn-sm btn-outline-secondary"
                                            type="submit"
                                            disabled={!canPair}
                                        >
                                            {m["baroo.backstage.pos.regenerate_code"]()}
                                        </button>
                                    </form>
                                    <form
                                        method="POST"
                                        action="?/discardDevice"
                                        use:enhance
                                        onsubmit={(event) => {
                                            if (!confirm(m["baroo.backstage.pos.discard_confirm"]({ label: device.label }))) {
                                                event.preventDefault();
                                            }
                                        }}
                                    >
                                        <input type="hidden" name="deviceId" value={device.id} />
                                        <button class="btn btn-sm btn-outline-danger" type="submit">
                                            {m["baroo.backstage.pos.discard"]()}
                                        </button>
                                    </form>
                                {/if}
                            </div>
                        </td>
                    </tr>

                    {#if device.code}
                        <tr class="pairing-row">
                            <td colspan="5">
                                <div class="pairing">
                                    <output class="pairing-code">{device.code.code}</output>
                                    <div class="pairing-text">
                                        <strong>{m["baroo.backstage.pos.code_label"]()}</strong>
                                        <span>{m["baroo.backstage.pos.code_hint"]({ url: "/enroll" })}</span>
                                        {#if device.code.state === "expired"}
                                            <span class="expired">{m["baroo.backstage.pos.code_expired"]()}</span>
                                        {:else}
                                            <span>{m["baroo.backstage.pos.code_expires"]({ time: formatExpiry(device.code.expiresAt) })}</span>
                                        {/if}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    {/if}

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

                                    <PosConfigFields
                                        config={device.config}
                                        idSuffix={device.id}
                                        layout="row"
                                        size="sm"
                                    />

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

    .create-device {
        margin-bottom: 2rem;

        h2 {
            margin: 0;
        }
    }

    .device-config {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 1rem 1.5rem;
        padding: 0.5rem 0;

        .actions {
            margin-inline-start: auto;
        }
    }

    .pairing {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        padding: 0.5rem 0;

        .pairing-code {
            font-size: 2.5rem;
            font-weight: 700;
            letter-spacing: 0.25em;
            font-variant-numeric: tabular-nums;
            padding-inline-start: 0.25em;
        }

        .pairing-text {
            display: flex;
            flex-direction: column;
            color: #666;

            .expired {
                color: #dc3545;
            }
        }
    }
</style>
