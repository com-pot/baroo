<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/backstage.scss";

    import type { LayoutData } from './$types';

    let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="backstage-layout">
    <header class="backstage-header">
        <div class="brand">
            <h1>Backstage</h1>
        </div>
        <nav class="backstage-nav">
            <ul>
                <li>
                    <a href="/backstage/bars">Bars</a>
                </li>
            </ul>
        </nav>
        <div class="user-info">
            <span>{data.user.name || data.user.email}</span>
        </div>
    </header>

    {@render children()}
</div>
