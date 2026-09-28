<script lang="ts">
import type { PosDeviceConfig } from "$lib/pos/device";
import PosConfigFields from "$lib/pos/PosConfigFields.svelte";
import * as m from "$lib/paraglide/messages.js";

const {
    config,
}: {
    config: PosDeviceConfig,
} = $props()


function savePreferences(form: HTMLFormElement) {

}

</script>

<form onsubmit={(e) => {
    e.preventDefault()
    savePreferences(e.target)
}}>
    <PosConfigFields config={config} />
    <button class="btn btn-primary" type="submit">{m["generic.action.save"]()}</button>
</form>
