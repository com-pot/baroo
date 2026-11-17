<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount } from "svelte";
    import { invalidateAll } from "$app/navigation";
    import { getRenderer } from "$lib/rendering.svelte";
    import { tapModel } from "$lib/taps/models";
    import { tapLabel } from "$lib/taps/barTap";
    import { ReplError } from "$lib/serial/microPythonRepl";
    import { serialPortFilters, serialPortId, serialPortVendor } from "$lib/serial/platform";
    import { MissingPrerequisites, uploadToTap, type TapUploadStep } from "$lib/taps/tapUpload";
    import type { PageData } from "./$types";

    type Step = TapUploadStep | { step: "authorizing" };

    let {
        tap,
        onDone,
    }: {
        tap: PageData["taps"][number];
        onDone?: () => void;
    } = $props();

    const renderer = getRenderer();

    const model = $derived(tapModel(tap.model));

    let serial = $state<Serial | null>(null);
    let ports = $state.raw<SerialPort[]>([]);

    let busy = $state(false);
    let error = $state<string | null>(null);
    let step = $state<Step | null>(null);
    let uploaded = $state(false);
    /** A config file the tap was authorized with that didn't make it to its device */
    let issued = $state<string | null>(null);

    onMount(() => {
        serial = navigator.serial ?? null;
        if (!serial) return;

        const refresh = async () => (ports = await serial!.getPorts());
        refresh();
        serial.addEventListener("connect", refresh);
        serial.addEventListener("disconnect", refresh);
        return () => {
            serial?.removeEventListener("connect", refresh);
            serial?.removeEventListener("disconnect", refresh);
        };
    });

    /** Issues the tap a new token, replying with its config file - its only copy */
    async function authorizeTap(): Promise<string> {
        const response = await fetch(`taps/${encodeURIComponent(tap.id)}/authorize`, { method: "POST" });
        if (!response.ok) {
            const body = await response.json().catch(() => null) as { message?: string } | null;
            throw new Error(body?.message ?? `HTTP ${response.status}`);
        }

        return response.text();
    }

    /** The previous token stops working - fine for a tap that never had one */
    function confirmRevoke(): boolean {
        return !tap.validThrough || confirm(m["baroo.backstage.taps.authorize_confirm"]({ tap: tapLabel(tap) }));
    }

    async function download() {
        if (busy || !confirmRevoke()) return
        busy = true
        error = null

        try {
            downloadFile(await authorizeTap());
            await invalidateAll();
            onDone?.();
        } catch (err) {
            error = describe(err);
        } finally {
            busy = false
        }
    }

    async function upload(port: SerialPort) {
        if (busy || !model?.runtime || !confirmRevoke()) return
        busy = true
        error = null
        uploaded = false
        issued = null

        try {
            step = { step: "authorizing" };
            issued = await authorizeTap();
            await uploadToTap(port, await model.runtime(issued), (next) => (step = next));
            issued = null;
            uploaded = true;
        } catch (err) {
            error = describe(err);
        } finally {
            busy = false
            step = null
            await invalidateAll();
        }
    }

    async function pickPort() {
        if (!serial) return

        try {
            const port = await serial.requestPort({ filters: serialPortFilters });
            if (!ports.includes(port)) ports = [...ports, port];
        } catch {
            // Nothing picked
        }
    }

    function downloadFile(file: string) {
        const url = URL.createObjectURL(new Blob([file], { type: "text/x-python" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "config.py";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }

    function describe(err: unknown): string {
        if (err instanceof MissingPrerequisites) {
            return m["baroo.backstage.taps.upload.error.missing"]({ files: err.paths.join(", ") });
        }
        if (err instanceof ReplError) {
            if (err.code === "exec") return m["baroo.backstage.taps.upload.error.exec"]({ detail: err.detail });
            return m[`baroo.backstage.taps.upload.error.${err.code}`]();
        }

        return err instanceof Error ? err.message : String(err);
    }

    function portLabel(port: SerialPort, i: number): string {
        const name = serialPortVendor(port);
        return ports.length > 1 ? `${name} #${i + 1}` : name;
    }

    function stepLabel(step: Step): string {
        switch (step.step) {
            case "connecting": return m["baroo.backstage.taps.upload.step.connecting"]();
            case "file": return m["baroo.backstage.taps.upload.step.file"]({ file: step.path });
            case "authorizing": return m["baroo.backstage.taps.upload.step.authorizing"]();
            case "restarting": return m["baroo.backstage.taps.upload.step.restarting"]();
        }
    }
</script>

<div class="tap-authorization">
    <p class="hint">{m["baroo.backstage.taps.authorize_hint"]()}</p>
    {#if tap.validThrough}
        <p class="alert alert-warning">
            {m["baroo.backstage.taps.authorize_revokes"]({ date: renderer.formatDate(tap.validThrough) })}
        </p>
    {/if}

    {#if error}
        <div class="alert alert-danger" role="alert">
            <p>{error}</p>
            {#if issued}
                <p>{m["baroo.backstage.taps.upload.issued_hint"]()}</p>
                <button type="button" class="btn btn-sm btn-danger" onclick={() => downloadFile(issued!)}>
                    {m["baroo.backstage.taps.authorize_download"]()}
                </button>
            {/if}
        </div>
    {/if}

    <section>
        <h3>{m["baroo.backstage.taps.authorize_download_title"]()}</h3>
        <p class="hint">{m["baroo.backstage.taps.authorize_download_hint"]()}</p>
        <button type="button" class="btn btn-outline-primary" disabled={busy} onclick={download}>
            {m["baroo.backstage.taps.authorize_download"]()}
        </button>
    </section>

    {#if model?.runtime}
        <section>
            <h3>{m["baroo.backstage.taps.upload.title"]()}</h3>
            {#if !serial}
                <p class="hint">{m["baroo.backstage.taps.upload.unsupported"]()}</p>
            {:else}
                <p class="hint">{m["baroo.backstage.taps.upload.hint"]()}</p>

                <ul class="list-group">
                    {#each ports as port, i (port)}
                        <li class="list-group-item port">
                            <span>
                                {portLabel(port, i)}
                                <small class="hint">{serialPortId(port)}</small>
                            </span>
                            <button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={() => upload(port)}>
                                {m["baroo.backstage.taps.upload.start"]()}
                            </button>
                        </li>
                    {:else}
                        <li class="list-group-item hint">{m["baroo.backstage.taps.upload.none"]()}</li>
                    {/each}
                </ul>
                <div>
                    <button type="button" class="btn btn-sm btn-outline-secondary" disabled={busy} onclick={pickPort}>
                        {m["baroo.backstage.taps.upload.pick"]()}
                    </button>
                </div>

                {#if step}
                    <div class="progress-step" role="status">
                        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                        {stepLabel(step)}
                    </div>
                    {#if step.step === "file"}
                        <div class="progress" role="progressbar" aria-valuenow={step.done} aria-valuemin={0} aria-valuemax={step.total}>
                            <div class="progress-bar" style:width="{(step.done / step.total) * 100}%"></div>
                        </div>
                    {/if}
                {/if}
                {#if uploaded}
                    <p class="alert alert-success" role="status">{m["baroo.backstage.taps.upload.done"]()}</p>
                {/if}
            {/if}
        </section>
    {/if}
</div>

<style lang="scss">
    .tap-authorization {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: min(36rem, 100%);

        section {
            display: flex;
            flex-direction: column;
            align-items: start;
            gap: 0.5rem;

            > .list-group {
                align-self: stretch;
            }
        }

        h3 {
            font-size: 1rem;
            font-weight: 700;
            margin: 0;
        }

        p {
            margin: 0;
        }

        .alert {
            display: flex;
            flex-direction: column;
            align-items: start;
            gap: 0.5rem;
        }
    }

    .hint {
        color: var(--bs-secondary-color);
    }

    .port {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .progress-step {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .progress {
        align-self: stretch;
    }
</style>
