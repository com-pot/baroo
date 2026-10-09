<script lang="ts">
import type { OfflineBar } from "$lib/offline/store.svelte";
import type { PosDeviceConfig } from "$lib/pos/device";
import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
import * as m from "$lib/paraglide/messages.js";

let {
    bar,
    onDone,
}: {
    bar: OfflineBar;
    onDone?: () => void
} = $props()

// svelte-ignore state_referenced_locally -- seeded once, on purpose: see above.
let draft = $state<PosDeviceConfig>({ ...bar.config })
let saving = $state(false)

async function savePreferences() {
    if (saving) return
    saving = true
    try {
        await bar.process("device-config", { config: $state.snapshot(draft) })
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
