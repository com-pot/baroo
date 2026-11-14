<script lang="ts">
    import z from "zod";
    import { messageOf } from "$lib/i18n";
    import SchemaInput from "./SchemaInput.svelte";

    let {
        schema,
        data = $bindable(),
        /** Captions by `${i18nPrefix}${name}`, help by `${i18nPrefix}${name}.help` */
        i18nPrefix,
        idSuffix,
        fieldId = (name: string) => (idSuffix ? `${name}-${idSuffix}` : name),
        wrapperClasses = {},
        layout = "stack",

        ...attrs
    }: {
        schema: z.ZodObject,
        data: Record<string, any>,
        i18nPrefix: string,
        readonly?: boolean,
        idSuffix?: string,
        fieldId?: (name: string) => string,
        wrapperClasses?: Record<string, string | undefined>,
        layout?: "row" | "stack",
    } = $props();
</script>

<div class="schema-form" data-layout={layout}>
    {#each Object.entries(schema.shape) as [name, inputSchema] (name)}
        <SchemaInput
            inputSchema={inputSchema as z.ZodType}
            {name}
            readonly={attrs.readonly}
            {fieldId}
            {i18nPrefix}

            wrapperClass={wrapperClasses[name] ?? ''}

            bind:value={data[name]}
        />
    {/each}
</div>

<style lang="scss">
    .schema-form {
        &[data-layout="row"] {
            flex: 1;
            display: flex;
            flex-wrap: wrap;
            align-items: end;
            gap: 1rem 1.5rem;
        }

        &[data-layout="stack"] {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        :global(.form-check) {
            margin: 0;
        }

        :global(.form-check.moot) {
            opacity: 0.6;
        }
    }
</style>
