<script lang="ts">
    import { getUiLayers } from "$lib/ui/uiLayers.svelte";
    import { AppVersion, AppHomepage, formatBuildDate } from "$lib/version";
    import { onMount } from "svelte";
    import Credits from "./Credits.svelte";

    const uiLayers = getUiLayers()


    function versionClicked() {
        const scope = 'dialog' in uiLayers.scopes ? 'dialog' : 'default'
        uiLayers.pushSnippet(creditsCard, {}, {
            scope,
        })
    }
</script>

<div class="build-info">
    <a href={AppHomepage} target="_blank">Baroo</a>
    <button class="btn btn-text" onclick={versionClicked}>{(AppVersion)}</button>
    <span role="separator">⊙</span>
    <span>{formatBuildDate()}</span>
</div>

{#snippet creditsCard()}
    <div class="card">
        <div class="card-body">
            <Credits />
        </div>
    </div>
{/snippet}
