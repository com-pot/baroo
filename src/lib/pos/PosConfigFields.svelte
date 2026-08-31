<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { GREETING_NAME_TOKEN, POS_THEMES, type PosDeviceConfig } from "$lib/pos/device";

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
        size?: "md" | "sm";
    } = $props();

    const fieldId = (name: string) => (idSuffix ? `${name}-${idSuffix}` : name);
    const sized = (base: string) => (size === "sm" ? `${base} ${base}-sm` : base);

    /** Live copy of the template, so the greeting hint reacts before saving. */
    let draftTemplate = $state(config.greetingTemplate);

    const narrationOff = $derived(!draftTemplate.trim());
</script>

<div class="pos-config" data-layout={layout}>
    <div class="input-pair">
        <label class="form-label" for={fieldId("theme")}>
            {m["baroo.backstage.pos.theme"]()}
        </label>
        <select class={sized("form-select")} id={fieldId("theme")} name="theme">
            {#each POS_THEMES as theme (theme)}
                <option value={theme} selected={theme === config.theme}>{theme}</option>
            {/each}
        </select>
    </div>

    <div class="form-check">
        <input
            class="form-check-input"
            type="checkbox"
            id={fieldId("genZToy")}
            name="genZToy"
            checked={config.genZToy}
        />
        <label class="form-check-label" for={fieldId("genZToy")}>
            {m["baroo.backstage.pos.gen_z_toy"]()}
            <small>{m["baroo.backstage.pos.gen_z_toy_help"]()}</small>
        </label>
    </div>

    <div class="form-check">
        <input
            class="form-check-input"
            type="checkbox"
            id={fieldId("idInput")}
            name="idInput"
            checked={config.idInput}
        />
        <label class="form-check-label" for={fieldId("idInput")}>
            {m["baroo.backstage.pos.id_input"]()}
            <small>{m["baroo.backstage.pos.id_input_help"]()}</small>
        </label>
    </div>

    <div class="input-pair greeting">
        <label class="form-label" for={fieldId("greetingTemplate")}>
            {m["baroo.backstage.pos.greeting_template"]()}
        </label>
        <input
            class={sized("form-control")}
            type="text"
            id={fieldId("greetingTemplate")}
            name="greetingTemplate"
            bind:value={draftTemplate}
            placeholder={`Ave ${GREETING_NAME_TOKEN}`}
        />
        <small>{m["baroo.backstage.pos.greeting_template_help"]({ token: GREETING_NAME_TOKEN })}</small>
    </div>

    <!-- Stays enabled even when moot: disabling it would drop it from the form and
         silently save it as off. -->
    <div class="form-check" class:moot={narrationOff}>
        <input
            class="form-check-input"
            type="checkbox"
            id={fieldId("customGreetings")}
            name="customGreetings"
            checked={config.customGreetings}
        />
        <label class="form-check-label" for={fieldId("customGreetings")}>
            {m["baroo.backstage.pos.custom_greetings"]()}
            <small>
                {narrationOff
                    ? m["baroo.backstage.pos.narration_off"]()
                    : m["baroo.backstage.pos.custom_greetings_help"]()}
            </small>
        </label>
    </div>
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
