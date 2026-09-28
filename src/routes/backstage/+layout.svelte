<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";
    import * as m from "$lib/paraglide/messages.js";

    import type { LayoutData } from './$types';
    import type { Snippet } from "svelte";
    import { setUiLayers, UiLayerManager } from "$lib/ui/uiLayers.svelte";
    import DrawerStack from "$lib/ui/DrawerStack.svelte";

    const layerManager = setUiLayers(new UiLayerManager())

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="backstage-layout">
    <header class="navbar">
        <div class="navbar-brand">
            <h1>Baroo</h1>
            <small>{m["baroo.backstage.title"]()}</small>
        </div>
        <nav class="backstage-nav">
            <ul>
                <li>
                    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a>
                </li>
                <li>
                    <a href="/backstage/devices">{m["baroo.devices.breadcrumb"]()}</a>
                </li>
            </ul>
        </nav>
        <div class="user-info dropdown">
            <span>{data.user.name || data.user.email}</span>
            <div class="dropdown-menu">
                <form method="POST" action="/logout">
                    <button type="submit" class="dropdown-item">
                        <span>{m["baroo.login.logout"]()}</span>
                    </button>
                </form>
            </div>
        </div>
    </header>

    {@render children()}

    <DrawerStack layerManager={layerManager} />
</div>
