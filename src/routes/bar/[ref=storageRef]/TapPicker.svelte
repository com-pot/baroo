<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { compareTaps } from "$lib/bar/stats/barOfferItems";

    /** Can't clash with a tap id */
    const NEW_TAP = "+";

    let {
        id,
        name,
        taps,
        offerItems,
        value = $bindable(""),
    }: {
        id: string,
        /** For a form posted as it is */
        name?: string,
        /** Known taps, with what is on them */
        taps: { tap: string, offerItemKey: string | null }[],
        offerItems: Pick<BarOfferItem, "key" | "name">[],
        /** Tap id, empty for none */
        value?: string,
    } = $props();

    const options = $derived.by(() => {
        const known = new Map<string, string | null>();
        for (const { tap, offerItemKey } of taps) {
            if (!known.get(tap)) known.set(tap, offerItemKey);
        }

        return [...known]
            .sort(([a], [b]) => compareTaps(a, b))
            .map(([tap, offerItemKey]) => ({
                tap,
                onTap: offerItemKey
                    ? offerItems.find((item) => item.key === offerItemKey)?.name ?? offerItemKey
                    : m["baroo.bar.tap.nothing_on_tap"](),
            }));
    });

    // Taps live only in the events unsealing onto them, so a new one is just an id nobody used yet
    let creating = $state(false);
    const picked = $derived(creating || (value && !options.some((option) => option.tap === value)) ? NEW_TAP : value);

    function pick(e: Event & { currentTarget: HTMLSelectElement }) {
        creating = e.currentTarget.value === NEW_TAP;
        value = creating ? "" : e.currentTarget.value;
    }
</script>

<div class="tap-picker">
    <select class="form-select" {id} value={picked} onchange={pick}>
        <option value="">{m["baroo.bar.tap.none"]()}</option>
        {#each options as option (option.tap)}
            <option value={option.tap}>{m["baroo.bar.tap.title"]({ tap: option.tap })} — {option.onTap}</option>
        {/each}
        <option value={NEW_TAP}>{m["baroo.bar.tap.create"]()}</option>
    </select>

    {#if picked === NEW_TAP}
        <input
            class="form-control"
            type="text"
            required
            maxlength="16"
            pattern={"[a-z0-9\\-]{1,16}"}
            autocomplete="off"
            aria-label={m["baroo.bar.tap.create_label"]()}
            placeholder={m["baroo.bar.tap.create_placeholder"]()}
            {value}
            oninput={(e) => (value = e.currentTarget.value.trim().toLowerCase())}
        />
    {/if}

    {#if name}
        <input type="hidden" {name} {value} />
    {/if}
</div>

<style lang="scss">
    .tap-picker {
        display: flex;
        gap: 0.5rem;

        > * {
            flex: 1;
        }
    }
</style>
