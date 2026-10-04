<script lang="ts">
import type { BarOfflineStore } from "$lib/offline/store.svelte";
import type { PosDeviceConfig } from "$lib/pos/device";
import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
import * as m from "$lib/paraglide/messages.js";
import { untrack } from "svelte";

let {
    store,
    onDone,
}: {
    store: BarOfflineStore;
    onDone?: () => void
} = $props()

let draft = $state<PosDeviceConfig>(untrack(() => ({ ...store.config })))
let saving = $state(false)

async function savePreferences() {
    if (saving) return
    saving = true
    try {
        await store.process("device-config", { config: $state.snapshot(draft) })
        onDone?.()
    } finally {
        saving = false
    }
}
</script>

<form onsubmit={(e) => {
    e.preventDefault()
    savePreferences()
}}>
    <PosConfigFields bind:data={draft} />
    <button class="btn btn-primary" type="submit" disabled={saving}>{m["generic.action.save"]()}</button>
</form>
