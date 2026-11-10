<script lang="ts">
    import z from "zod";
    import { describeField, messageOf } from "$lib/zchem/field";
    import SchemaForm, { type SchemaFormOptions } from "./SchemaForm.svelte";
    import * as m from "$lib/paraglide/messages.js";

    let {
        inputSchema,
        name,
        caption,
        help,

        fieldId,
        wrapperClass,
        placeholder,
        /** Captions of nested fields, by `${i18nPrefix}${name}.${field}` */
        i18nPrefix = "",
        options = {},

        value = $bindable(null),
    }: {
        inputSchema: z.ZodType,
        name: string,
        caption: string,
        help?: string,

        fieldId: (name: string) => string,
        wrapperClass?: string,
        placeholder?: string,
        i18nPrefix?: string,
        options?: SchemaFormOptions,

        value: any,
    } = $props()

    const field = $derived(describeField(inputSchema))

    const enumOptions = $derived.by(() => {
        if (field.base.type !== 'enum') return []
        const prefix = field.meta.enumI18nPrefix

        return ((field.base as z.ZodEnum).options as string[]).map((value) => ({
            value,
            label: (prefix && messageOf(`${prefix}${value}`)) || value,
        }))
    })

    const element = $derived(field.base instanceof z.ZodArray ? field.base.element as z.ZodType : null)

    function addRow() {
        if (!element) return
        value = [...(value ?? []), element.parse({})]
    }

    function removeRow(index: number) {
        value = (value ?? []).filter((_: unknown, i: number) => i !== index)
    }

    const maxRows = $derived(((field.base._zod.bag as { maximum?: number }).maximum) ?? Infinity)
</script>

{#if field.meta.optionsFrom}
    <div class="input-pair {wrapperClass}" data-name={name}>
        <label class="form-label" for={fieldId(name)}>{caption}</label>
        <select class="form-select" id={fieldId(name)} {name} bind:value={value}>
            <option value="">—</option>
            {#each options[field.meta.optionsFrom] ?? [] as option (option.value)}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
        {#if help}<small>{help}</small>{/if}
    </div>
{:else if field.meta.palette}
    <fieldset class="input-pair palette {wrapperClass}" data-name={name}>
        <legend class="form-label">{caption}</legend>
        <div class="swatches">
            {#each field.meta.palette as color, index (color.key)}
                {@const label = messageOf(`${field.meta.paletteI18nPrefix ?? ''}${color.key}`) ?? color.key}
                <label class="swatch" title={label} style:--swatch={color.fill}>
                    <input type="radio" name={fieldId(name)} value={index} checked={value === index} onchange={() => (value = index)} />
                    <span class="visually-hidden">{label}</span>
                </label>
            {/each}
        </div>
        {#if help}<small>{help}</small>{/if}
    </fieldset>
{:else if field.kind === 'string'}
    <div class="input-pair {wrapperClass}" data-name={name}>
        <label class="form-label" for={fieldId(name)}>{caption}</label>
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
{:else if field.kind === 'number'}
    <div class="input-pair {wrapperClass}" data-name={name}>
        <label class="form-label" for={fieldId(name)}>{caption}</label>
        <input
            class={"form-control"}
            type="number"
            id={fieldId(name)}
            name={name}
            value={value ?? ''}
            oninput={(e) => {
                const raw = e.currentTarget.value
                value = raw === '' && field.nullable ? null : Number(raw)
            }}
            placeholder={placeholder ?? (field.nullable ? '—' : undefined)}
        />
        {#if help}<small>{help}</small>{/if}
    </div>
{:else if field.kind === 'boolean'}
    <div class="form-check {wrapperClass}" data-name={name}>
        <input
            class="form-check-input"
            type="checkbox"
            id={fieldId(name)}
            name={name}
            bind:checked={value}
        />
        <label class="form-check-label" for={fieldId(name)}>
            {caption}
            {#if help}<small>{help}</small>{/if}
        </label>
    </div>
{:else if field.kind === 'enum'}
    <div class="input-pair {wrapperClass}" data-name={name}>
        <label class="form-label" for={fieldId(name)}>{caption}</label>
        <select class={"form-select"} id={fieldId(name)} name={name} bind:value={value}>
            {#each enumOptions as option (option.value)}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>
        {#if help}<small>{help}</small>{/if}
    </div>
{:else if field.kind === 'array' && element instanceof z.ZodObject}
    <fieldset class="input-pair rows {wrapperClass}" data-name={name}>
        <legend class="form-label">{caption}</legend>
        {#if help}<small>{help}</small>{/if}

        {#each value ?? [] as _, index (index)}
            <div class="row-item">
                <SchemaForm
                    schema={element}
                    bind:data={value[index]}
                    i18nPrefix={`${i18nPrefix}${name}.`}
                    fieldId={(nested) => fieldId(`${name}-${index}-${nested}`)}
                    {options}
                    layout="row"
                />
                <button class="btn btn-sm btn-outline-danger" type="button" onclick={() => removeRow(index)}>
                    {m["generic.action.remove"]()}
                </button>
            </div>
        {/each}

        {#if (value?.length ?? 0) < maxRows}
            <button class="btn btn-sm btn-outline-secondary" type="button" onclick={addRow}>
                {m["generic.action.add"]()}
            </button>
        {/if}
    </fieldset>
{:else}
    <div class="alert alert-danger">
        Unnown field <b>{name}</b>
        <div>type={inputSchema.type}, base={field.base.type}</div>
    </div>
{/if}

<style lang="scss">
    fieldset.input-pair {
        border: 0;
        padding: 0;
        margin: 0;

        legend {
            font-size: 1rem;
            float: none;
        }
    }

    .swatches {
        display: flex;
        gap: 0.4rem;
    }

    .swatch {
        position: relative;
        width: 1.9rem;
        height: 1.9rem;
        border-radius: 50%;
        background: var(--swatch);
        border: 2px solid var(--bs-border-color);
        cursor: pointer;

        input {
            position: absolute;
            opacity: 0;
            inset: 0;
            cursor: pointer;
        }

        &:has(input:checked) {
            outline: 3px solid var(--bs-primary);
            outline-offset: 2px;
        }

        &:has(input:focus-visible) {
            box-shadow: 0 0 0 0.25rem rgb(var(--bs-primary-rgb), 0.35);
        }
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: start;
    }

    .row-item {
        display: flex;
        align-items: end;
        gap: 1rem;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--bs-border-color);
        border-radius: 0.5rem;
    }
</style>
