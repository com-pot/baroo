<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { compareTaps } from "$lib/bar/stats/barOfferItems";

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
</script>

<!-- Taps are prepared in backstage, a tap the kiosk doesn't know of yet comes with the next pull -->
<select class="form-select" {id} {name} bind:value>
    <option value="">{m["baroo.bar.tap.none"]()}</option>
    {#each options as option (option.tap)}
        <option value={option.tap}>{m["baroo.bar.tap.title"]({ tap: option.tap })} — {option.onTap}</option>
    {/each}
</select>
