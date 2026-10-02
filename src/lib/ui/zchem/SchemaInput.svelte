<script lang="ts">
    import z from "zod";

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
            {#each inputSchema.def.innerType.options as optionValue (optionValue)}
                <option value={optionValue}>{optionValue}</option>
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
