<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { configSchema, type PosDeviceConfig } from "$lib/pos/device";
    import SchemaInput from "$lib/ui/zchem/SchemaInput.svelte";

    let {
        data = $bindable(),
        idSuffix,
        layout = "stack",
    }: {
        data: PosDeviceConfig;
        idSuffix?: string;
        layout?: "row" | "stack";
    } = $props();

    const fieldId = (name: string) => (idSuffix ? `${name}-${idSuffix}` : name);

    const narrationOff = $derived(!data.greetingTemplate.trim());

    const wrapperClasses: Record<string, string | undefined> = $derived({
        customGreetings: narrationOff ? 'moot' : undefined,
    })
</script>

<div class="pos-config" data-layout={layout}>
    {#each Object.entries(configSchema.def.shape) as [name, inputSchema] (name)}
        <SchemaInput
            {inputSchema}
            {name}
            caption={m["baroo.pos.config." + name]?.() ?? ''}
            help={m["baroo.pos.config." + name + '.help']?.()}
            {fieldId}

            wrapperClass={wrapperClasses[name] ?? ''}

            bind:value={data[name as keyof PosDeviceConfig]}
        />
    {/each}
</div>

<style lang="scss">
    .pos-config {
        &[data-layout="row"] {
            flex: 1;
            display: flex;
            flex-wrap: wrap;
            align-items: end;
            gap: 1rem 1.5rem;

            .greeting {
                flex: 1 1 20rem;
            }
        }

        &[data-layout="stack"] {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .form-check {
            margin: 0;
        }

        .form-check-label small {
            display: block;
            color: #666;
        }

        .form-check.moot {
            opacity: 0.6;
        }
    }
</style>
