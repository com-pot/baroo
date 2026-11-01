<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import { enhance } from '$app/forms';
    import { untrack } from 'svelte';
    import type { BarOfferItem, OfferPackage } from '$lib/bar/BarModel';
    import type { OfferStock } from '$lib/bar/stats/barOfferItems';
    import { formatQuantity, measureLabel, packageLabel } from '$lib/bar/quantity';
    import TapPicker from '../../../bar/[ref=storageRef]/TapPicker.svelte';

    const {
        entry,
        packages,
        taps,
        offerItems,
        onSuccess,
    }: {
        entry: OfferStock,
        packages: OfferPackage[],
        /** Taps to pick from, with what is on them */
        taps: { tap: string, offerItemKey: string | null }[],
        offerItems: Pick<BarOfferItem, 'key' | 'name'>[],
        onSuccess: () => unknown,
    } = $props();

    const own = $derived(packages.filter((offerPackage) => offerPackage.offerItemKey === entry.item.key));

    // The package kind it had last, the tap it is on
    const usual = untrack(() => own.find((offerPackage) => offerPackage.id === entry.packageId) ?? own[0]);
    let packageId = $state(usual?.id ?? '');
    let quantity = $state(usual ? String(usual.quantity) : '');
    let tap = $state(untrack(() => entry.taps[0] ?? ''));
    let flushCurrent = $state(true);

    function pickPackage(e: Event & { currentTarget: HTMLSelectElement }) {
        packageId = e.currentTarget.value;
        const picked = own.find((offerPackage) => offerPackage.id === packageId);
        if (picked) quantity = String(picked.quantity);
    }
</script>

<form method="POST" action="?/unseal" class="flow-block" use:enhance={() => {
    return async ({ update, result }) => {
        await update()
        if (result.type === 'success') onSuccess()
    }
}}>
    <input type="hidden" name="offerItemKey" value={entry.item.key} />

    {#if own.length}
        <div class="input-pair">
            <label for="unseal.package" class="form-label">{m["baroo.staff.unseal_package"]()}</label>
            <select class="form-select" id="unseal.package" name="packageId" value={packageId} onchange={pickPackage}>
                <option value="">{m["baroo.staff.unseal_package_custom"]()}</option>
                {#each own as offerPackage (offerPackage.id)}
                    <option value={offerPackage.id}>{packageLabel(offerPackage, entry.measure)}</option>
                {/each}
            </select>
        </div>
    {:else}
        <input type="hidden" name="packageId" value="" />
    {/if}

    <div class="input-pair">
        <label for="unseal.quantity" class="form-label">{m["baroo.backstage.bar.unseal_quantity"]({ measure: measureLabel(entry.measure) })}</label>
        <input
            type="number"
            id="unseal.quantity"
            name="quantity"
            class="form-control"
            min={entry.measure === 'count' ? 1 : 0.1}
            step={entry.measure === 'count' ? 1 : 0.1}
            required
            bind:value={quantity}
        />
    </div>

    <div class="input-pair">
        <label for="unseal.tap" class="form-label">{m["baroo.staff.unseal_tap"]()}</label>
        <TapPicker id="unseal.tap" name="tap" {taps} {offerItems} bind:value={tap} />
    </div>

    {#if entry.unsealedAt}
        <div class="form-check">
            <input class="form-check-input" type="checkbox" id="unseal.flushCurrent" name="flushCurrent" bind:checked={flushCurrent} />
            <label class="form-check-label" for="unseal.flushCurrent">
                {m["baroo.staff.unseal_flush_current"]()}
                <small>
                    {flushCurrent
                        ? m["baroo.staff.unseal_flush_current_hint"]({ left: formatQuantity(entry.measure, entry.left ?? 0) })
                        : m["baroo.staff.unseal_top_up_hint"]()}
                </small>
            </label>
        </div>
    {:else}
        <!-- Nothing open to keep, but whatever got opened meanwhile goes -->
        <input type="hidden" name="flushCurrent" value="on" />
    {/if}

    <div class="actions">
        <button type="submit" class="btn btn-primary">
            {m["baroo.backstage.bar.unseal"]()}
        </button>
    </div>
</form>
