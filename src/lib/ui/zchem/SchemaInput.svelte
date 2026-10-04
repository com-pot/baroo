<script lang="ts">
    import z from "zod";
    import * as m from "$lib/paraglide/messages.js"

    let {
        inputSchema,
        name,
        caption,
        help,

        fieldId,
        wrapperClass,
        placeholder,

        value = $bindable(null),
    }: {
        inputSchema: z.ZodType,
        name: string,
        caption: string,
        help?: string,

        fieldId: (name: string) => string,
        wrapperClass?: string,
        placeholder?: string,

        value: any,
    } = $props()

    const inputMeta = $derived(inputSchema.meta())

    const enumOptions = $derived.by(() => {
        if (inputSchema.def.innerType.type !== 'enum') return []
        const prefix = inputMeta?.enumI18nPrefix
        const options: { value: string, label: string }[] = []

        for (const value of inputSchema.def.innerType.options as string[]) {
            let label: string = value
            if (prefix) {
                const key = `${prefix}${value}`
                if (key in m) {
                    label = m[key]()
                }
            }
            options.push({ value, label })
        }
        return options
    })
</script>

{#if inputSchema.def.innerType.type === 'string'}
    <div class="input-pair {wrapperClass}" data-name={name}>
        <label class="form-label" for={fieldId(name)}>{caption ?? name}</label>
        <input
            class={"form-control"}
            type="text"
            id={fieldId(name)}
            name={name}
            bind:value={value}
            placeholder={placeholder}
        />
        {#if help}<small>{help}</small>{/if}
    </div>
{:else if inputSchema.def.innerType.type === 'boolean'}
    <div class="form-check {wrapperClass}" data-name={name}>
        <input
            class="form-check-input"
            type="checkbox"
            id={fieldId(name)}
            name={name}
            bind:checked={value}
        />
        <label class="form-check-label" for={fieldId(name)}>
            {caption ?? name}
            {#if help}<small>{help}</small>{/if}
        </label>
    </div>
{:else if inputSchema.def.innerType.type === 'enum'}

    <div class="input-pair">
        <label class="form-label" for={fieldId(name)}>{caption}</label>
        <select class={"form-select"} id={fieldId(name)} name={name} bind:value={value}>
            {#each enumOptions as option (option.value)}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
        {#if help}<small>{help}</small>{/if}
    </div>
{:else}
    <div class="alert alert-danger">
        Unnown field <b>{name}</b>
        <div>type={inputSchema.type}, def.innerType={inputSchema.def.innerType.type}</div>
    </div>
{/if}
