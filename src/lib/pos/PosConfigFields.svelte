<script lang="ts">
    import { configSchema, type PosDeviceConfig } from "$lib/pos/device";
    import SchemaForm from "$lib/ui/zchem/SchemaForm.svelte";

    let {
        data = $bindable(),
        idSuffix,
        layout = "stack",
    }: {
        data: PosDeviceConfig;
        idSuffix?: string;
        layout?: "row" | "stack";
    } = $props();

    const narrationOff = $derived(!data.greetingTemplate.trim());

    const wrapperClasses: Record<string, string | undefined> = $derived({
        customGreetings: narrationOff ? 'moot' : undefined,
    })
</script>

<SchemaForm
    schema={configSchema}
    bind:data
    i18nPrefix="baroo.pos.config."
    {idSuffix}
    {wrapperClasses}
    {layout}
/>
