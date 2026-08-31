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
    import type { PageData, ActionData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let existing = $state<DeviceIdentity | null>(null);
    let showForm = $state(false);
    let stage = $state<"idle" | "submitting" | "priming" | "done">("idle");
    let error = $state<string | null>(null);

    onMount(async () => {
        existing = await readDevice();
        showForm = !existing;
    });

    /**
     * Enrolment isn't finished when the record exists — it's finished when the tablet
     * has the data it needs to work offline. So we prime the snapshot before handing
     * over to the kiosk.
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
        {:else if !data.authenticated}
            <p>{m["baroo.enroll.intro"]()}</p>
            <a class="btn btn-primary" href={data.loginUrl}>{m["baroo.login.submit"]()}</a>
        {:else}
            <p>{m["baroo.enroll.intro"]()}</p>

            {#if error}
                <p class="alert alert-danger" role="alert">{m["baroo.enroll.error"]({ error })}</p>
            {:else if form && "error" in form && form.error}
                <p class="alert alert-danger" role="alert">{m["baroo.enroll.error"]({ error: String(form.error) })}</p>
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
                <div>
                    <label class="form-label" for="label">{m["baroo.enroll.label"]()}</label>
                    <input
                        class="form-control"
                        id="label"
                        name="label"
                        required
                        placeholder={m["baroo.enroll.label_placeholder"]()}
                    />
                </div>

                <div>
                    <label class="form-label" for="bar">{m["baroo.enroll.bar"]()}</label>
                    <select class="form-select" id="bar" name="bar" required>
                        {#each data.bars as bar (bar.id)}
                            <option value={bar.id} selected={bar.id === data.preselectBar}>{bar.name}</option>
                        {/each}
                    </select>
                </div>

                <fieldset>
                    <legend class="form-label">{m["baroo.enroll.kind"]()}</legend>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="kind" id="kind-kiosk" value="kiosk" checked />
                        <label class="form-check-label" for="kind-kiosk">{m["baroo.enroll.kind_kiosk"]()}</label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="kind" id="kind-staff" value="staff" />
                        <label class="form-check-label" for="kind-staff">{m["baroo.enroll.kind_staff"]()}</label>
                    </div>
                </fieldset>

                <button class="btn btn-primary" type="submit" disabled={stage !== "idle"}>
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
    }
</style>
