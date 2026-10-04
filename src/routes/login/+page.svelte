<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { enhance } from "$app/forms";
    import type { PageProps } from "./$types";

    let { data, form }: PageProps = $props();
    let submitting = $state(false);
</script>

<svelte:head>
    <title>{m["auth.login.title"]()}</title>
</svelte:head>

<main class="page-centered">
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
        <h1>{m["auth.login.title"]()}</h1>

        {#if form?.error}
            <p class="alert alert-danger" role="alert">
                {m["auth.login.error_invalid"]()}
            </p>
        {/if}

        <input type="hidden" name="redirectTo" value={data.redirectTo ?? ""} />

        <div>
            <label class="form-label" for="who">{m["auth.login.who"]()}</label>
            <input
                class="form-control"
                id="who"
                name="who"
                type="who"
                autocomplete="username"
                required
                value={form?.who ?? ""}
            />
        </div>

        <div>
            <label class="form-label" for="password">{m["auth.login.password"]()}</label>
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
            {m["auth.login.submit"]()}
        </button>
    </form>
</main>
