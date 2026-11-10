<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { applyAction, deserialize, enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { onMount } from "svelte";
    import type { PageData, ActionData } from "./$types";
    import { getUiLayers, type UiLayer } from "$lib/ui/uiLayers.svelte";
    import { getRenderer } from "$lib/rendering.svelte";
    import SchemaForm from "$lib/ui/zchem/SchemaForm.svelte";
    import { tapModel } from "$lib/taps/models";
    import { tapLabel } from "$lib/taps/barTap";
    import { TAP_STALE_MS } from "$lib/taps/tapEvents";
    import TapBadge from "../../../../bar/[ref=storageRef]/TapBadge.svelte";

    type Tap = PageData["taps"][number];

    const uiLayers = getUiLayers()
    const renderer = getRenderer()

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /** Under this much of its token's life left, a tap wants authorizing again */
    const RENEW_WITHIN_MS = 30 * 24 * 60 * 60_000;

    const formError = $derived(
        form && "error" in form && form.error ? String(form.error) : null,
    );

    const wifiOptions = $derived({
        wifiNetworks: data.wifiNetworks.map((network) => ({ value: network.id, label: network.ssid })),
    });

    // Ticks so taps that went quiet show as such
    let now = $state(Date.now());
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 5_000);
        return () => clearInterval(timer);
    });

    function alive(tap: Tap): boolean | null {
        return tap.lastSeen ? now - Date.parse(tap.lastSeen) < TAP_STALE_MS : null;
    }

    let configuring = $state<UiLayer>();
    let draft = $state<{ name: string, posDevice: string, config: Record<string, any> }>({ name: "", posDevice: "", config: {} });
    let busy = $state(false);
    let configError = $state<string | null>(null);

    function configure(tap: Tap) {
        if (configuring) return

        draft = {
            name: tap.name,
            posDevice: tap.posDevice,
            config: structuredClone(tap.config ?? {}),
        };
        configError = null;
        configuring = uiLayers.pushSnippet(configureForm, { tap }, {
            heading: `${m["baroo.backstage.taps.configure"]()} — ${tapLabel(tap)}`,
            onDestroyed() {
                configuring = undefined
            },
        }) as UiLayer
    }

    async function saveTap(tap: Tap): Promise<boolean> {
        const body = new FormData();
        body.set("tapId", tap.id);
        body.set("name", draft.name);
        body.set("posDevice", draft.posDevice);
        body.set("config", JSON.stringify($state.snapshot(draft.config)));

        const response = await fetch("?/saveTap", {
            method: "POST",
            body,
            headers: { "x-sveltekit-action": "true" },
        });
        const result = deserialize(await response.text());
        await applyAction(result);

        return result.type === "success";
    }

    async function save(tap: Tap) {
        if (busy) return
        busy = true

        try {
            if (await saveTap(tap)) {
                await invalidateAll();
                configuring?.ctrl.close();
            }
        } finally {
            busy = false
        }
    }

    /** Saves, then hands over the config file with a fresh token - the old one stops working */
    async function authorize(tap: Tap) {
        if (busy) return
        if (tap.validThrough && !confirm(m["baroo.backstage.taps.authorize_confirm"]({ tap: tapLabel(tap) }))) return

        busy = true
        configError = null

        try {
            if (!await saveTap(tap)) return

            const response = await fetch(`taps/${encodeURIComponent(tap.id)}/authorize`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ config: $state.snapshot(draft.config) }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null) as { message?: string } | null;
                configError = body?.message ?? `HTTP ${response.status}`;
                return
            }

            download(await response.blob(), "config.py");
            await invalidateAll();
            configuring?.ctrl.close();
        } finally {
            busy = false
        }
    }

    function download(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
</script>

<svelte:head>
    <title>{m["baroo.backstage.taps.title"]()}</title>
</svelte:head>

<main class="backstage-content" data-page="bar.taps">
    <header class="page-header">
        <h1>{m["baroo.backstage.taps.title"]()}</h1>
        <div class="actions">
            <form method="POST" action="?/createTap" use:enhance>
                <input type="hidden" name="name" value="" />
                <input type="hidden" name="posDevice" value="" />
                <button class="btn btn-primary" type="submit">
                    {m["baroo.backstage.taps.create"]()}
                </button>
            </form>
        </div>
    </header>

    {#if formError}
        <p class="alert alert-danger" role="alert">{formError}</p>
    {/if}

    <table class="table">
        <thead>
            <tr>
                <th>{m["baroo.backstage.taps.tap"]()}</th>
                <th>{m["baroo.backstage.taps.now_serving"]()}</th>
                <th>{m["baroo.backstage.taps.pos_device"]()}</th>
                <th>{m["baroo.backstage.taps.last_seen"]()}</th>
                <th>{m["baroo.backstage.taps.authorization"]()}</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            {#each data.taps as tap (tap.id)}
                <tr>
                    <td>
                        <TapBadge tap={String(tap.sequence)} label={tapLabel(tap)} alive={alive(tap)} />
                        <small class="model">{tap.model}</small>
                    </td>
                    <td>{tap.nowServing ?? "—"}</td>
                    <td>{tap.posDeviceLabel ?? "—"}</td>
                    <td>{tap.lastSeen ? renderer.formatDate(tap.lastSeen) : "—"}</td>
                    <td>
                        {#if tap.authorization === "authorized" && tap.validThrough}
                            <span class:renew={Date.parse(tap.validThrough) - now < RENEW_WITHIN_MS}>
                                {m["baroo.backstage.taps.valid_through"]({ date: renderer.formatDate(tap.validThrough) })}
                            </span>
                        {:else}
                            <span class="badge" class:text-bg-warning={tap.authorization === "changed"}
                                class:text-bg-danger={tap.authorization === "expired"}
                                class:text-bg-secondary={tap.authorization === "unauthorized"}
                            >
                                {m[`baroo.backstage.taps.authorization.${tap.authorization}`]()}
                            </span>
                        {/if}
                    </td>
                    <td>
                        <div class="actions">
                            {#if tapModel(tap.model)}
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick={() => configure(tap)}>
                                    {m["baroo.backstage.taps.configure"]()}
                                </button>
                            {/if}
                            <form
                                method="POST"
                                action="?/deleteTap"
                                use:enhance
                                onsubmit={(event) => {
                                    if (!confirm(m["baroo.backstage.taps.delete_confirm"]({ tap: tapLabel(tap) }))) {
                                        event.preventDefault();
                                    }
                                }}
                            >
                                <input type="hidden" name="tapId" value={tap.id} />
                                <button class="btn btn-sm btn-outline-danger" type="submit">
                                    {m["baroo.backstage.taps.delete"]()}
                                </button>
                            </form>
                        </div>
                    </td>
                </tr>
            {:else}
                <tr>
                    <td colspan="6">
                        <div class="empty-state">
                            <p>{m["baroo.backstage.taps.none"]()}</p>
                        </div>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>

    <section class="card wifi">
        <div class="card-header">
            <h2>{m["baroo.backstage.taps.wifi.title"]()}</h2>
        </div>
        <div class="card-body">
            <p class="hint">{m["baroo.backstage.taps.wifi.hint"]()}</p>

            {#each data.wifiNetworks as network (network.id)}
                <form method="POST" action="?/saveWifi" class="wifi-row" use:enhance={() => async ({ update }) => update({ reset: false })}>
                    <input type="hidden" name="id" value={network.id} />
                    {@render wifiFields(network.id, network)}
                    <div class="actions">
                        <button class="btn btn-sm btn-outline-primary" type="submit">{m["generic.action.save"]()}</button>
                        <button class="btn btn-sm btn-outline-danger" type="submit" formaction="?/removeWifi"
                            onclick={(event) => {
                                if (!confirm(m["baroo.backstage.taps.wifi.remove_confirm"]({ ssid: network.ssid }))) {
                                    event.preventDefault();
                                }
                            }}
                        >
                            {m["generic.action.remove"]()}
                        </button>
                    </div>
                </form>
            {/each}

            <form method="POST" action="?/saveWifi" class="wifi-row" use:enhance>
                <input type="hidden" name="id" value="" />
                {@render wifiFields("new", null)}
                <div class="actions">
                    <button class="btn btn-sm btn-primary" type="submit">{m["generic.action.add"]()}</button>
                </div>
            </form>
        </div>
    </section>
</main>

{#snippet wifiFields(idSuffix: string, network: { ssid: string, country: string } | null)}
    <div class="input-pair">
        <label class="form-label" for="wifi-ssid-{idSuffix}">{m["baroo.backstage.taps.wifi.ssid"]()}</label>
        <input class="form-control" id="wifi-ssid-{idSuffix}" name="ssid" required maxlength="32" value={network?.ssid ?? ""} />
    </div>
    <div class="input-pair">
        <label class="form-label" for="wifi-password-{idSuffix}">{m["baroo.backstage.taps.wifi.password"]()}</label>
        <input class="form-control" id="wifi-password-{idSuffix}" name="password" type="password" maxlength="63"
            autocomplete="new-password"
            placeholder={network ? m["baroo.backstage.taps.wifi.password_keep"]() : ""}
        />
    </div>
    <div class="input-pair country">
        <label class="form-label" for="wifi-country-{idSuffix}">{m["baroo.backstage.taps.wifi.country"]()}</label>
        <input class="form-control" id="wifi-country-{idSuffix}" name="country" maxlength="2" pattern={"[A-Za-z]{2}"}
            value={network?.country ?? "CZ"}
        />
    </div>
{/snippet}

{#snippet configureForm({ tap }: { tap: Tap })}
    {@const model = tapModel(tap.model)}
    <form class="tap-config" onsubmit={(event) => { event.preventDefault(); save(tap); }}>
        <div class="identity">
            <div class="input-pair">
                <label class="form-label" for="tap-name-{tap.id}">{m["baroo.backstage.taps.name"]()}</label>
                <input class="form-control" id="tap-name-{tap.id}" maxlength="40" bind:value={draft.name}
                    placeholder={tapLabel({ sequence: tap.sequence })}
                />
            </div>
            <div class="input-pair">
                <label class="form-label" for="tap-device-{tap.id}">{m["baroo.backstage.taps.pos_device"]()}</label>
                <select class="form-select" id="tap-device-{tap.id}" bind:value={draft.posDevice}>
                    <option value="">—</option>
                    {#each data.devices as device (device.id)}
                        <option value={device.id}>{device.label}</option>
                    {/each}
                </select>
            </div>
        </div>

        {#if model}
            <fieldset>
                <legend class="form-label">{m["baroo.backstage.taps.config_legend"]({ model: model.key })}</legend>
                <SchemaForm
                    schema={model.configSchema}
                    bind:data={draft.config}
                    i18nPrefix="baroo.tap.config."
                    idSuffix={tap.id}
                    options={wifiOptions}
                />
            </fieldset>
        {/if}

        {#if configError}
            <p class="alert alert-danger" role="alert">{configError}</p>
        {/if}

        <div class="actions">
            <button type="submit" class="btn btn-outline-primary" disabled={busy}>
                {m["generic.action.save"]()}
            </button>
            <button type="button" class="btn btn-primary" disabled={busy} onclick={() => authorize(tap)}>
                {m["baroo.backstage.taps.authorize"]()}
            </button>
            <button type="button" class="btn btn-secondary" onclick={() => (configuring?.ctrl.close())}>
                {m["baroo.backstage.offer.cancel"]()}
            </button>
        </div>
        <small class="hint">{m["baroo.backstage.taps.authorize_hint"]()}</small>
    </form>
{/snippet}

<style lang="scss">
    .model {
        display: block;
        color: var(--bs-secondary-color);
    }

    .renew {
        color: var(--bs-warning-text-emphasis);
        font-weight: 700;
    }

    .wifi {
        margin-top: 2rem;

        h2 {
            font-size: 1.25rem;
            margin: 0;
        }

        .hint {
            color: var(--bs-secondary-color);
        }
    }

    .wifi-row {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 0.75rem 1rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--bs-border-color);

        .country {
            width: 5rem;
        }

        .actions {
            display: flex;
            gap: 0.5rem;
        }
    }

    .tap-config {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: min(40rem, 100%);

        .identity {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem 1.5rem;

            > * {
                flex: 1 1 14rem;
            }
        }

        fieldset legend {
            float: none;
            font-size: 1rem;
            font-weight: 700;
        }

        .actions {
            display: flex;
            gap: 0.5rem;
        }

        .hint {
            color: var(--bs-secondary-color);
        }
    }
</style>
