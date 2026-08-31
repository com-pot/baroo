<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { readDevice, writeDevice } from "$lib/offline/idb";
    import { pullSnapshot } from "$lib/offline/sync";
    import type { DeviceIdentity } from "$lib/offline/types";
    import type { ActionData } from "./$types";

    let { form }: { form: ActionData } = $props();

    let existing = $state<DeviceIdentity | null>(null);
    let showForm = $state(false);
    let stage = $state<"idle" | "submitting" | "priming" | "done">("idle");
    let error = $state<string | null>(null);
    let code = $state("");

    onMount(async () => {
        existing = await readDevice();
        showForm = !existing;
    });

    /**
     * Pairing isn't finished when the tablet has an identity — it's finished when it has
     * the data it needs to work offline. So we prime the snapshot before handing over to
     * the kiosk.
     */
    async function completeEnrollment(identity: DeviceIdentity) {
        await writeDevice(identity);
        existing = identity;

        stage = "priming";
        try {
            await pullSnapshot(identity.barSlug);
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            stage = "idle";
            return;
        }

        stage = "done";
        await goto(`/bar/${identity.barSlug}`);
    }

    $effect(() => {
        if (form && "enrolled" in form && form.enrolled && stage === "submitting") {
            completeEnrollment(form.enrolled as DeviceIdentity);
        }
    });

    const kindLabel = (kind: string) =>
        kind === "staff" ? m["baroo.enroll.kind_staff"]() : m["baroo.enroll.kind_kiosk"]();

    /** The server answers with a reason code; a tablet gets a sentence, never a stack. */
    function claimError(form: ActionData): string | null {
        if (!form || !("error" in form) || !form.error) return null;

        switch (String(form.error)) {
            case "bad-format":
                return m["baroo.enroll.errors.bad_format"]();
            case "unknown-code":
                return m["baroo.enroll.errors.unknown_code"]();
            case "expired":
                return m["baroo.enroll.errors.expired"]();
            case "device-inactive":
                return m["baroo.enroll.errors.device_inactive"]();
            case "throttled":
                return m["baroo.enroll.errors.throttled"]({
                    minutes: "retryAfterMinutes" in form ? Number(form.retryAfterMinutes) : 15,
                });
            default:
                return m["baroo.enroll.errors.unavailable"]();
        }
    }
</script>

<svelte:head>
    <title>{m["baroo.enroll.title"]()}</title>
</svelte:head>

<main class="enroll-page">
    <div class="card card-body flow-block">
        <h1>{m["baroo.enroll.title"]()}</h1>

        {#if existing && !showForm}
            <p>
                {m["baroo.enroll.current"]({
                    label: existing.label,
                    kind: kindLabel(existing.kind),
                    barName: existing.barName,
                })}
            </p>
            <div class="actions">
                <a class="btn btn-primary" href="/bar/{existing.barSlug}">{m["baroo.staff.back_to_kiosk"]()}</a>
                <button class="btn btn-outline-secondary" type="button" onclick={() => (showForm = true)}>
                    {m["baroo.enroll.reenroll"]()}
                </button>
            </div>
        {:else}
            <p>{m["baroo.enroll.intro"]()}</p>

            {#if error}
                <p class="alert alert-danger" role="alert">{m["baroo.enroll.error"]({ error })}</p>
            {:else if claimError(form)}
                <p class="alert alert-danger" role="alert">{claimError(form)}</p>
            {/if}

            {#if stage === "priming"}
                <p class="alert alert-info" role="status">{m["baroo.enroll.priming"]()}</p>
            {:else if stage === "done"}
                <p class="alert alert-success" role="status">{m["baroo.enroll.done"]()}</p>
            {/if}

            <form
                method="POST"
                class="flow-block"
                use:enhance={() => {
                    stage = "submitting";
                    error = null;
                    return async ({ update }) => {
                        await update({ reset: false });
                        if (stage === "submitting") stage = "idle";
                    };
                }}
            >
                <div class="input-pair">
                    <label class="form-label" for="code">{m["baroo.enroll.code"]()}</label>
                    <!-- svelte-ignore a11y_autofocus -- a kiosk being set up has nothing else to type into -->
                    <input
                        class="form-control code-input"
                        id="code"
                        name="code"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        pattern="[0-9]*"
                        maxlength="4"
                        minlength="4"
                        required
                        autofocus
                        bind:value={code}
                        oninput={(event) => (code = event.currentTarget.value.replace(/\D/g, "").slice(0, 4))}
                    />
                </div>

                <button
                    class="btn btn-primary btn-lg"
                    type="submit"
                    disabled={stage !== "idle" || code.length !== 4}
                >
                    {stage === "idle" ? m["baroo.enroll.submit"]() : m["baroo.enroll.submitting"]()}
                </button>
            </form>
        {/if}
    </div>
</main>

<style lang="scss">
    .enroll-page {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 1rem;

        .card {
            width: min(32rem, 100%);
        }

        .actions {
            display: flex;
            gap: 0.5rem;
        }

        .code-input {
            font-size: 3rem;
            height: auto;
            text-align: center;
            letter-spacing: 0.5em;
            font-variant-numeric: tabular-nums;
            padding-inline-start: 0.5em;
        }
    }
</style>
