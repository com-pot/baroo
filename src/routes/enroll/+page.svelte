<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";
    import logo from "$lib/assets/baroo/Baroo-Logotyp01-Colored.svg?raw";
    import { m } from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { readDevice, writeDevice } from "$lib/offline/idb";
    import { pullSnapshot } from "$lib/offline/sync";
    import type { DeviceIdentity } from "$lib/offline/types";
    import type { ActionData } from "./$types";
    import { messageOf } from "$lib/i18n";
    import type { ActionResult } from "@sveltejs/kit";
    import { getUiFeedback } from "$lib/ui/uiFeedback.svelte";
    import BuildInfo from "$lib/components/BuildInfo.svelte";

    const uiFeedback = getUiFeedback()

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

    async function completeEnrollment(identity: DeviceIdentity) {
        await writeDevice(identity);
        existing = identity;

        stage = "priming";
        try {
            await pullSnapshot(identity.bar.slug);
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            stage = "idle";
            return;
        }

        stage = "done";
        await goto(`/bar/${identity.bar.slug}`);
    }

    $effect(() => {
        if (form && "enrolled" in form && form.enrolled && stage === "submitting") {
            completeEnrollment(form.enrolled as DeviceIdentity);
        }
    });

    function getErrorMessage(result: ActionResult & {type: "error" | "failure"}) {
        let error: string = ''
        if (result.type === "failure") {
            error = result.data?.error
        } else if (result.type === "error") {
            error = result.error
        }

        if (error === "throttled") {
            return m["baroo.enroll.errors.throttled"]({ minutes: "retryAfterMinutes" in result ? Number(result.retryAfterMinutes) : 15, });
        }

        return messageOf(`baroo.enroll.errors.${error}`) ?? m["baroo.enroll.errors.unavailable"]()
    }

</script>

<svelte:head>
    <title>{m["baroo.enroll.title"]()}</title>
</svelte:head>

<main class="page-centered enroll-page">
    <div class="container-fluid">
        <div class="card brand">
            <div class="card-body">
                {@html logo}
            </div>
        </div>
        <div class="card card-body">
            <h1>{m["baroo.enroll.title"]()}</h1>

            {#if existing && !showForm}
                <p>
                    {m["baroo.enroll.current"]({
                        label: existing.device.label,
                        kind: m[`baroo.pos.kind.${existing.device.kind}`](),
                        barName: existing.bar.name,
                    })}
                </p>
                <div class="actions">
                    <a class="btn btn-primary" href="/bar/{existing.bar.slug}">{m["baroo.staff.back_to_kiosk"]()}</a>
                    <button class="btn btn-outline-secondary" type="button" onclick={() => (showForm = true)}>
                        {m["baroo.enroll.reenroll"]()}
                    </button>
                </div>
            {:else}
                <p>{m["baroo.enroll.intro"]()}</p>

                {#if error}
                    <p class="alert alert-danger" role="alert">{m["baroo.enroll.error"]({ error })}</p>
                {/if}

                {#if stage === "priming"}
                    <p class="alert alert-info" role="status">{m["baroo.enroll.priming"]()}</p>
                {:else if stage === "done"}
                    <p class="alert alert-success" role="status">{m["baroo.enroll.done"]()}</p>
                {/if}

                <form
                    method="POST"
                    class="flow-block"
                    use:enhance={({ submitter }) => {
                        stage = "submitting";
                        error = null;
                        return async ({ update, result }) => {
                            await update({ reset: false });

                            if (result.type === "failure" || result.type === "error") {
                                const errorMessage = getErrorMessage(result)
                                uiFeedback.plopResult(errorMessage, {
                                    fromEl: submitter!,
                                    level: "danger",
                                })
                            }

                            if (stage === "submitting") stage = "idle";
                        };
                    }}
                >
                    <div class="input-pair">
                        <label class="form-label visually-hidden" for="code">{m["baroo.enroll.code"]()}</label>
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
                            bind:value={
                                () => code,
                                (value) => code = value.replace(/\D/g, "").slice(0, 4)
                            }
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
    </div>
</main>
<footer>
    <BuildInfo />
</footer>

<style lang="scss">
    .enroll-page {
        .card {
            text-align: center;
            align-items: center;
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
