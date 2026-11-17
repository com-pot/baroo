<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import { page } from '$app/state';
    import type { LayoutData } from './$types';
    import type { Snippet } from 'svelte';

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    const base = $derived(`/backstage/bars/${data.ref}`);

    const tabs = $derived([
        {
            href: base,
            label: m["baroo.backstage.bar.tabs.overview"](),
            match: [data.layoutRouteId],
        },
        {
            href: `${base}/offer`,
            label: m["baroo.backstage.bar.tabs.offer"](),
            match: [`${data.layoutRouteId}/offer`],
        },
        {
            href: `${base}/summaries`,
            label: m["baroo.backstage.bar.tabs.members"](),
            match: [`${data.layoutRouteId}/summaries`, `${data.layoutRouteId}/mapper`],
        },
        {
            href: `${base}/pos`,
            label: m["baroo.backstage.bar.tabs.pos"](),
            match: [`${data.layoutRouteId}/pos`],
        },
        {
            href: `${base}/taps`,
            label: m["baroo.backstage.bar.tabs.taps"](),
            match: [`${data.layoutRouteId}/taps`],
        },
    ]);

    const isActive = (match: string[]) => match.includes(page.route.id ?? '');
</script>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a> /
    {#if data.bar}
        <a href={base}>{data.bar.name}</a>
    {:else}
        <span>{m["baroo.backstage.bars.new_bar"]()}</span>
    {/if}
</nav>

{#if data.bar}
    <nav class="bar-tabs">
        <ul class="nav nav-tabs">
            {#each tabs as tab (tab.href)}
                {@const active = isActive(tab.match)}
                <li class="nav-item">
                    <a
                        class="nav-link"
                        class:active
                        aria-current={active ? 'page' : undefined}
                        href={tab.href}
                    >{tab.label}</a>
                </li>
            {/each}
        </ul>
    </nav>
{/if}

{@render children()}
