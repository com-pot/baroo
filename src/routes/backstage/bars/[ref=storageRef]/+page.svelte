<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<nav class="breadcrumbs">
	<a href="/backstage/bars">Bars</a> / {data.ref.key === 'new' ? 'New Bar' : data.bar?.name}
</nav>

<main class="backstage-content" data-page="bar.edit">
    <header class="page-header">
        <h2>{data.ref.key === 'new' ? 'Create New Bar' : 'Edit Bar'}</h2>
    </header>

    {#if data.ref.type === 'local'}
        <div class="card card-body info-message">
            <p><strong>This is a local (localStorage) bar.</strong></p>
            <p>Local bars cannot be edited through the backstage. They are managed locally in the browser.</p>
        </div>
    {:else}
    <div class="row">
        <div class="col" style="max-width: 600px">
            <div class="card">
                <form method="POST" action="?/save" use:enhance
                    class="card-body flow-block"
                >
                    <div class="input-pair">
                        <label for="slug" class="form-label">Slug</label>
                        <input
                            type="text"
                            id="slug"
                            name="slug"
                            class="form-control"
                            value={form?.data?.slug ?? data.bar?.slug ?? ''}
                            required
                            pattern="[a-z0-9\-]+"
                            placeholder="my-bar"
                            class:error={form?.errors?.slug}
                        />
                        {#if form?.errors?.slug}
                            <span class="error-message">{form.errors.slug}</span>
                        {/if}
                        <small>Lowercase letters, numbers, and hyphens only (2-40 characters)</small>
                    </div>

                    <div class="input-pair">
                        <label for="name" class="form-label">Name</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            class="form-control"
                            value={form?.data?.name ?? data.bar?.name ?? ''}
                            required
                            placeholder="My Awesome Bar"
                            class:error={form?.errors?.name}
                        />
                        {#if form?.errors?.name}
                            <span class="error-message">{form.errors.name}</span>
                        {/if}
                        <small>Display name for your bar (minimum 2 characters)</small>
                    </div>

                    <div class="actions">
                        <button type="submit" class="btn btn-primary">
                            {data.ref.key === 'new' ? 'Create Bar' : 'Save Changes'}
                        </button>

                        {#if data.ref.key !== 'new'}
                            <button
                                type="submit"
                                formaction="?/delete"
                                class="btn btn-danger"
                                onclick={(e) => {
                                    if (!confirm('Are you sure you want to delete this bar?')) {
                                        e.preventDefault();
                                    }
                                }}
                            >
                                Delete Bar
                            </button>
                        {/if}
                    </div>

                    {#if form?.success}
                        <div class="alert alert-success">Bar saved successfully!</div>
                    {/if}
                </form>
            </div>
        </div>

        <div class="col-auto">
            <div class="card">
                <div class="card-body">
                    {#if data.ref.key !== 'new'}
                    <a href="/backstage/bars/{data.ref.key}/offer" class="btn btn-secondary">Manage offer</a>
                    <a href="/backstage/bars/{data.ref.key}/mapper" class="btn btn-secondary">Member mapping</a>
                    {:else}
                    <p>Save first</p>
                    {/if}
                </div>
            </div>
        </div>
    </div>
    {/if}
</main>
