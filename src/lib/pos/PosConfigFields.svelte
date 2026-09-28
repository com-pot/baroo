<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { configSchema, GREETING_NAME_TOKEN, type PosDeviceConfig } from "$lib/pos/device";
    import { type Size } from "$lib/ui/bootstrap";
    import SchemaInput from "$lib/ui/zchem/SchemaInput.svelte";

    let {
        config,
        idSuffix,
        layout = "stack",
        size = "md",
    }: {
        /** What the fields start from — a stored config, or the defaults when enrolling. */
        config: PosDeviceConfig;
        /** Keeps the field ids unique when a page shows several of these at once. */
        idSuffix?: string;
        /** `row` for the inline form in a backstage table, `stack` for a plain form. */
        layout?: "row" | "stack";
        size?: Size;
    } = $props();

    const fieldId = (name: string) => (idSuffix ? `${name}-${idSuffix}` : name);

    /** Live copy of the template, so the greeting hint reacts before saving. */
    let draftTemplate = $state(config.greetingTemplate);

    const data = $state(configSchema.parse({...config}))
    const narrationOff = $derived(!draftTemplate.trim());

    const placeholders = $derived({
        greetingTemplate: `Ave ${GREETING_NAME_TOKEN}`,
    })
    const wrapperClasses = $derived({
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
            placeholder={placeholders[name]}

            bind:value={data[name]}
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
