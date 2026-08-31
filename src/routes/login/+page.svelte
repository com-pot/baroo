<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageData, ActionData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();
    let submitting = $state(false);
</script>

<svelte:head>
    <title>{m["baroo.login.title"]()}</title>
</svelte:head>

<main class="login-page">
    <form
        method="POST"
        class="card card-body flow-block"
        use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
                await update();
                submitting = false;
            };
        }}
    >
        <h1>{m["baroo.login.title"]()}</h1>

        {#if form?.error}
            <p class="alert alert-danger" role="alert">
                {form.error === "missing-credentials"
                    ? m["baroo.login.error_missing"]()
                    : m["baroo.login.error_invalid"]()}
            </p>
        {/if}

        <input type="hidden" name="redirectTo" value={data.redirectTo ?? ""} />

        <div>
            <label class="form-label" for="email">{m["baroo.login.email"]()}</label>
            <input
                class="form-control"
                id="email"
                name="email"
                type="email"
                autocomplete="username"
                required
                value={form?.email ?? ""}
            />
        </div>

        <div>
            <label class="form-label" for="password">{m["baroo.login.password"]()}</label>
            <input
                class="form-control"
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
            />
        </div>

        <button class="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? m["baroo.login.submitting"]() : m["baroo.login.submit"]()}
        </button>
    </form>
</main>

<style lang="scss">
    .login-page {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 1rem;

        form {
            width: min(28rem, 100%);
        }
    }
</style>
