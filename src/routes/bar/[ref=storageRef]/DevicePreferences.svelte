<script lang="ts">
import type { OfflineBar } from "$lib/offline/store.svelte";
import type { PosDeviceConfig } from "$lib/pos/device";
import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
import * as m from "$lib/paraglide/messages.js";

/**
 * The tablet's settings, changed where it stands.
 *
 * Saving is an op like any other: it takes effect here at once and reaches the server
 * whenever there is a server to reach. `onDone` is the drawer closing itself — the barman
 * came to change one thing, and by then it is already changed.
 */
let { bar, onDone }: { bar: OfflineBar; onDone?: () => void } = $props()

/**
 * A draft rather than the store's own config: the kiosk sits in front of a room, and it
 * should not re-theme itself field by field while the barman is still deciding.
 */
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
