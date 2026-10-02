<script lang="ts">
    import "$lib/assets/styles/drawer.scss";
    import "$lib/assets/styles/staff-drawer.scss";
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";
    import Accordion from "$lib/components/Accordion.svelte";
    import AccordionGroup from "$lib/components/AccordionGroup.svelte";
    import NewMemberWidget from "./NewMemberWidget.svelte";
    import TagMemberMappingWidget from "./TagMemberMappingWidget.svelte";
    import SettlementWidget from "./SettlementWidget.svelte";
    import SyncWidget from "./SyncWidget.svelte";
    import SnapshotDebugWidget from "./SnapshotDebugWidget.svelte";
    import CacheResetWidget from "./CacheResetWidget.svelte";
    import { kioskPrefs } from "$lib/pos/kioskPrefs.svelte";
    import { getUiLayers, type UiLayerCtrl } from "$lib/ui/uiLayers.svelte";
    import DevicePreferences from "./DevicePreferences.svelte";

    const uiLayers = getUiLayers()

    /**
     * The barman's tools, one operation per fold.
     *
     * The card and its heading live here rather than inside each widget: a widget is the
     * form for one operation and nothing else, which is what lets the whole stack be
     * folded, titled and reordered from this one place. Sharing a `name` across the
     * operations makes them exclusive — the drawer is ~550px, and four open forms would
     * mean scrolling past three of them to reach the fourth.
     */
    let { bar }: { bar: OfflineBar } = $props();

    /**
     * `DrawerStack` spreads only the layer's props, so the ctrl never reaches the
     * component — the drawer closes itself through this closure instead, which reads
     * `prefsCtrl` long after it has been assigned. One at a time, so a second tap on the
     * button doesn't stack a second copy of the form over the first.
     */
    let prefsCtrl = $state<UiLayerCtrl | null>(null)
    function openPreferences() {
        if (prefsCtrl) return

        prefsCtrl = uiLayers.pushComponent(DevicePreferences, {
            bar,
            onDone: () => prefsCtrl?.close(),
        }, {
            heading: m["baroo.staff.device_prefs_title"]({ label: bar.deviceLabel }),
            onDestroyed: () => { prefsCtrl = null },
        }).ctrl
    }
</script>

<div class="staff-drawer">
    <AccordionGroup>
        <Accordion name="staff-op" title={m["baroo.staff.member_section"]()}>
            <NewMemberWidget {bar} />
        </Accordion>

        <Accordion name="staff-op" title={m["baroo.staff.tags_section"]()}>
            <TagMemberMappingWidget {bar} />
        </Accordion>

        <Accordion name="staff-op" title={m["baroo.staff.settle_section"]()}>
            <SettlementWidget {bar} />
        </Accordion>
    </AccordionGroup>

    <div class="actions">
        <button class="btn btn-outline-secondary btn-sm" onclick={() => openPreferences()}>
            <span>{m["baroo.staff.device_prefs"]()}</span>
        </button>

    </div>

    {#if bar.config.idInput}
        <section class="staff-section">
            <h2>{m["baroo.staff.kiosk_section"]()}</h2>

            <div class="form-check">
                <input
                    class="form-check-input"
                    type="checkbox"
                    id="idInputLetters"
                    bind:checked={kioskPrefs.idInputLetters}
                />
                <label class="form-check-label" for="idInputLetters">
                    {m["baroo.staff.id_input_letters"]()}
                    <small>{m["baroo.staff.id_input_letters_help"]()}</small>
                </label>
            </div>
        </section>
    {/if}

    <!-- Not an operation, so it sits under its own heading and out of the exclusive group. -->
    <section class="staff-section">
        <h2>{m["baroo.staff.debug_section"]()}</h2>

        <SnapshotDebugWidget {bar} />
        <CacheResetWidget {bar} />

        <AccordionGroup>
            <Accordion title={m["baroo.staff.sync_section"]()}>
                <SyncWidget {bar} />
            </Accordion>
        </AccordionGroup>
    </section>
</div>

<style lang="scss">
    // The help line reads as a second line under the label, the way the backstage
    // device form sets its checkboxes out.
    .form-check-label small {
        display: block;
        color: #666;
    }
</style>
