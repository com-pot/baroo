<script lang="ts">
    import "$lib/assets/styles/drawer.scss";
    import "$lib/assets/styles/staff-drawer.scss";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import Accordion from "$lib/components/Accordion.svelte";
    import NewMemberWidget from "./NewMemberWidget.svelte";
    import TagMemberMappingWidget from "./TagMemberMappingWidget.svelte";
    import SettlementWidget from "./SettlementWidget.svelte";
    import SnapshotDebugWidget from "./SnapshotDebugWidget.svelte";
    import CacheResetWidget from "./CacheResetWidget.svelte";
    import { getUiLayers, type UiLayerCtrl } from "$lib/ui/uiLayers.svelte";
    import DevicePreferences from "./DevicePreferences.svelte";

    const uiLayers = getUiLayers()

    let { store }: { store: BarOfflineStore } = $props();

    let prefsCtrl = $state<UiLayerCtrl | null>(null)
    function openPreferences() {
        if (prefsCtrl) return

        prefsCtrl = uiLayers.pushComponent(DevicePreferences, {
            store,
            onDone: () => prefsCtrl?.close(),
        }, {
            heading: m["baroo.staff.device_prefs_title"]({ label: store.deviceLabel }),
            onDestroyed: () => { prefsCtrl = null },
        }).ctrl
    }
</script>

<div class="staff-drawer">
    <div class="accordion-group">
        <Accordion name="staff-op" title={m["baroo.staff.member_section"]()}>
            <NewMemberWidget {store} />
        </Accordion>

        <Accordion name="staff-op" title={m["baroo.staff.tags_section"]()}>
            <TagMemberMappingWidget {store} />
        </Accordion>

        <Accordion name="staff-op" title={m["baroo.staff.settle_section"]()}>
            <SettlementWidget {store} />
        </Accordion>
    </div>

    <div class="actions">
        <button class="btn btn-outline-secondary btn-sm" onclick={() => openPreferences()}>
            <span>{m["baroo.staff.device_prefs"]()}</span>
        </button>
    </div>

    <section>
        <h2>{m["baroo.staff.debug_section"]()}</h2>

        <SnapshotDebugWidget {store} />
        <CacheResetWidget isOnline={() => store.lineCheck.online} />
    </section>
</div>
