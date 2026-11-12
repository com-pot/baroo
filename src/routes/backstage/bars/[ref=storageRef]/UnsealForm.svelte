<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import { enhance } from '$app/forms';
    import { untrack } from 'svelte';
    import type { BarOfferItem, OfferPackage } from '$lib/bar/BarModel';
    import { formatQuantity, measureLabel, packageLabel } from '$lib/bar/quantity';
    import type { TapState } from '$lib/taps/tapEvents';

    const {
        tap,
        offerItems,
        packages,
        onSuccess,
    }: {
        /** The tap to unseal onto, with what is on it */
        tap: TapState,
        offerItems: BarOfferItem[],
        /** Registered ones, waiting to be unsealed */
        packages: OfferPackage[],
        onSuccess: () => unknown,
    } = $props();

    let offerItemKey = $state(untrack(() => tap.offerItemKey ?? ''));
    const item = $derived(offerItems.find((candidate) => candidate.key === offerItemKey));
    const measure = $derived(item?.measure ?? 'volume');
    const own = $derived(packages.filter((offerPackage) => offerPackage.offerItemKey === offerItemKey));

    // The oldest registered package, the size the tap had last
    let packageId = $state(untrack(() => own[0]?.id ?? ''));
    let quantity = $state(untrack(() => tap.stock ? String(tap.stock.quantity) : ''));

    function pickItem(e: Event & { currentTarget: HTMLSelectElement }) {
        offerItemKey = e.currentTarget.value;
        packageId = own[0]?.id ?? '';
    }

    const replaced = $derived(tap.stock ? offerItems.find((candidate) => candidate.key === tap.offerItemKey) : undefined);
</script>

<form method="POST" action="?/unseal" class="flow-block" use:enhance={() => {
    return async ({ update, result }) => {
        await update()
        if (result.type === 'success') onSuccess()
    }
}}>
    <input type="hidden" name="tap" value={tap.tap} />

    <div class="input-pair">
        <label for="unseal.offerItemKey" class="form-label">{m["baroo.staff.unseal_item"]()}</label>
        <select class="form-select" id="unseal.offerItemKey" name="offerItemKey" value={offerItemKey} onchange={pickItem} required>
            <option value="" disabled>—</option>
            {#each offerItems as offer (offer.key)}
                <option value={offer.key}>{offer.name}</option>
            {/each}
        </select>
    </div>

    {#if own.length}
        <div class="input-pair">
            <label for="unseal.package" class="form-label">{m["baroo.staff.unseal_package"]()}</label>
            <select class="form-select" id="unseal.package" name="packageId" bind:value={packageId}>
                <option value="">{m["baroo.staff.unseal_package_new"]()}</option>
                {#each own as offerPackage (offerPackage.id)}
                    <option value={offerPackage.id}>{packageLabel(offerPackage, measure)}{offerPackage.tagSerial ? ' 📶' : ''}</option>
                {/each}
            </select>
        </div>
    {:else}
        <input type="hidden" name="packageId" value="" />
    {/if}

    {#if !packageId}
        <div class="input-pair">
            <label for="unseal.quantity" class="form-label">{m["baroo.backstage.bar.unseal_quantity"]({ measure: measureLabel(measure) })}</label>
            <input
                type="number"
                id="unseal.quantity"
                name="quantity"
                class="form-control"
                min={measure === 'count' ? 1 : 0.1}
                step={measure === 'count' ? 1 : 0.1}
                required
                bind:value={quantity}
            />
        </div>

        <div class="input-pair">
            <label for="unseal.label" class="form-label">{m["baroo.backstage.offer.package_label"]()}</label>
            <input
                type="text"
                id="unseal.label"
                name="label"
                class="form-control"
                maxlength="40"
                placeholder={m["baroo.backstage.offer.package_label_placeholder"]()}
            />
        </div>
    {/if}

    {#if tap.stock}
        <p class="form-text">
            {m["baroo.staff.unseal_flush_current_hint"]({
                name: replaced?.name ?? tap.offerItemKey ?? '',
                left: formatQuantity(replaced?.measure ?? 'volume', tap.stock.left),
            })}
        </p>
    {/if}

    <div class="actions">
        <button type="submit" class="btn btn-primary" disabled={!offerItemKey}>
            {m["baroo.backstage.bar.unseal"]()}
        </button>
    </div>
</form>
