<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";
    import * as m from "$lib/paraglide/messages.js";

    import type { LayoutData } from './$types';
    import type { Snippet } from "svelte";

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="backstage-layout">
    <header class="backstage-header">
        <div class="brand">
            <h1>Baroo</h1>
            <small>{m["baroo.backstage.title"]()}</small>
        </div>
        <nav class="backstage-nav">
            <ul>
                <li>
                    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a>
                </li>
            </ul>
        </nav>
        <div class="user-info">
            <span>{data.user.name || data.user.email}</span>
        </div>
    </header>

    {@render children()}
</div>
