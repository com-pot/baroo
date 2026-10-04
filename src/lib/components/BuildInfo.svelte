<script lang="ts">
    import { AppVersion, AppHomepage, formatBuildDate } from "$lib/version";
</script>

<div class="build-info">
    <a href={AppHomepage} target="_blank">Baroo</a>
    <span>{(AppVersion)}</span>
    <span role="separator">⊙</span>
    <span>{formatBuildDate()}</span>
</div>
