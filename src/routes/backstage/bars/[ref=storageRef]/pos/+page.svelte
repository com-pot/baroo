<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageData, ActionData } from "./$types";
    import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
    import { configSchema, deviceKinds, readPosConfig, type PosDeviceConfig } from "$lib/pos/device";
    import { getUiLayers, type UiLayer } from "$lib/ui/uiLayers.svelte";
    import { getRenderer } from "$lib/rendering.svelte";

    const uiLayers = getUiLayers()
    const renderer = getRenderer()

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let configuring = $state<UiLayer>();
    let configDraft = $state<PosDeviceConfig>(configSchema.parse({}));
    function configDevice(device: typeof data["devices"][number]) {
        if (configuring) return

        configDraft = readPosConfig(device.config);
        configuring = uiLayers.pushSnippet(configDeviceForm, {device}, {
            onDestroyed() {
                configuring = undefined
            },
        }) as UiLayer
    }

    const formError = $derived(
        form && "error" in form && form.error ? String(form.error) : null,
    );
    let newItemLayer = $state<ReturnType<typeof uiLayers["pushSnippet"]>>()
    let newConfig = $state<PosDeviceConfig>(configSchema.parse({}));
    function startPosCreation() {
        if (newItemLayer) {
            return
        }
        newItemLayer = uiLayers.pushSnippet(newFormSnippet, {}, {
            heading: m["baroo.backstage.pos.create_title"](),
            onDestroyed() {
                newItemLayer = undefined
                newConfig = configSchema.parse({});
            },
        }) as NonNullable<typeof newItemLayer>
    }

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
                disabled={!canPair}
                onclick={() => startPosCreation()}
            >
                {m["baroo.backstage.pos.create_device"]()}
            </button>
        </div>
    </header>

    {#if formError}
        <p class="alert alert-danger" role="alert">
            {(m[`baroo.backstage.pos.${formError}`] ?? (() => formError))()}
        </p>
    {/if}

    {#if data.pairing.status === "missing"}
        <p class="alert alert-warning" role="status">
            {m["baroo.backstage.pos.pairing-unavailable"]()}
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
                            {m[`baroo.pos.kind.${device.kind}`]()}
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
                                        onclick={() => configDevice(device)}
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
                                            <span>{m["baroo.backstage.pos.code_expires"]({ time: renderer.formatDate(device.code.expiresAt) })}</span>
                                        {/if}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    {/if}
                {/each}
            </tbody>
        </table>
    {/if}
</main>

{#snippet newFormSnippet()}
<div class="create-device">
    <form
        method="POST"
        action="?/createDevice"
        class="flow-block"
        use:enhance={() => async ({ update }) => {
            await update();
            newItemLayer?.ctrl.close()
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

        <div class="input-pair">
            <div class="form-label">{m["baroo.enroll.kind"]()}</div>
            <div class="btn-group">
                {#each deviceKinds as opt (opt)}
                    <input class="btn-check" type="radio" name="kind" id={"new-kind-" + opt} value={opt} checked />
                    <label class="btn btn-outline-primary" for={"new-kind-" + opt}>
                        {m[`baroo.pos.kind.${opt}`]()}
                    </label>
                {/each}
            </div>
        </div>

        <fieldset>
            <legend class="form-label">{m["baroo.backstage.pos.config_legend"]()}</legend>
            <input type="hidden" name="config" value={JSON.stringify(newConfig)} />
            <PosConfigFields bind:data={newConfig} idSuffix="new" />
        </fieldset>

        <div class="actions">
            <button class="btn btn-primary" type="submit">
                {m["baroo.backstage.pos.create_submit"]()}
            </button>
            <button class="btn btn-secondary" type="button" onclick={() => (newItemLayer?.ctrl.close())}>
                {m["baroo.backstage.offer.cancel"]()}
            </button>
        </div>
    </form>
</div>
{/snippet}

{#snippet configDeviceForm({ device }: { device: typeof data["devices"][number] })}
<form
    method="POST"
    action="?/saveConfig"
    class="device-config"
    use:enhance={() => async ({ update }) => {
        await update({ reset: false });
        configuring?.ctrl.close()
    }}
>
    <input type="hidden" name="deviceId" value={device.id} />

    <input type="hidden" name="config" value={JSON.stringify(configDraft)} />

    <PosConfigFields
        bind:data={configDraft}
        idSuffix={device.id}
        layout="row"
    />

    <div class="actions">
        <button type="submit" class="btn btn-sm btn-primary">
            {m["baroo.backstage.pos.save_config"]()}
        </button>
        <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={() => (configuring?.ctrl.close())}
        >
            {m["baroo.backstage.offer.cancel"]()}
        </button>
    </div>
</form>
{/snippet}

<style lang="scss">
    tr.inactive {
        opacity: 0.5;
    }

    .create-device {
        margin-bottom: 2rem;

        h2 {
            margin: 0;
        }

        :global(.pos-config) {
            display: contents;
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
