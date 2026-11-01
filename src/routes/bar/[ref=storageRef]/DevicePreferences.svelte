<script lang="ts">
import { untrack } from "svelte";
import type { BarOfflineStore } from "$lib/offline/store.svelte";
import type { PosDeviceConfig } from "$lib/pos/device";
import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
import * as m from "$lib/paraglide/messages.js";

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
        await store.process("device-config", { deviceId: store.device!.device.id, config: $state.snapshot(draft) })
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
