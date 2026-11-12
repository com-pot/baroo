<script lang="ts">
    import { untrack } from "svelte";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { packageState } from "$lib/bar/BarModel";
    import { formatQuantity, measureLabel, packageLabel } from "$lib/bar/quantity";
    import { newPackageId } from "$lib/bar/stats/barOfferItems";
    import TapPicker from "./TapPicker.svelte";

    let {
        store,
        lockedItemKey,
        tap: preselectedTap,
        taps,
        onDone,
    }: {
        store: Pick<BarOfflineStore, "barOffer" | "process" | "offerItems" | "packages" | "stock">;
        lockedItemKey?: string;
        /** The tap to unseal onto, the item's own one otherwise */
        tap?: string;
        /** Taps to pick from, with what is on them */
        taps: { tap: string, offerItemKey: string | null }[];
        onDone?: () => void;
    } = $props();

    let pickedKey = $state(untrack(() => preselectedTap
        ? store.packages.find((offerPackage) => offerPackage.tap === preselectedTap && packageState(offerPackage) === "unsealed")?.offerItemKey ?? ""
        : ""));

    const itemKey = $derived(lockedItemKey ?? pickedKey);
    const item = $derived(store.barOffer[itemKey]);
    /** Registered ones, waiting to be unsealed */
    const packages = $derived(store.packages.filter((offerPackage) => offerPackage.offerItemKey === itemKey
        && packageState(offerPackage) === "registered"));

    const measure = $derived(item?.measure ?? null);

    let packageId = $state("");
    let quantity = $state("");
    let tap = $state("");

    /** What gets flushed by the unseal: the package on the tap, or the item's one off the taps */
    const replaced = $derived(store.stock.find((entry) => entry.package
        && (tap ? entry.package.tap === tap : !entry.package.tap && entry.item.key === itemKey)));

    /** An item's own guesses: its oldest registered package, the size it had last, the tap it is on */
    function guessFor(key: string) {
        const own = store.packages.filter((offerPackage) => offerPackage.offerItemKey === key);
        const registered = own.filter((offerPackage) => packageState(offerPackage) === "registered");
        const open = own.find((offerPackage) => packageState(offerPackage) === "unsealed");

        packageId = registered[0]?.id ?? "";
        quantity = open ? String(open.quantity) : "";
        tap = preselectedTap ?? open?.tap ?? "";
    }
    untrack(() => guessFor(itemKey));

    function pickItem(e: Event & { currentTarget: HTMLSelectElement }) {
        pickedKey = e.currentTarget.value;
        guessFor(pickedKey);
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!item) return;

        const registered = packages.find((offerPackage) => offerPackage.id === packageId);
        await store.process("unseal", {
            offerItemKey: item.key,
            offerItemName: item.name,
            // A new package gets registered by the op, under an id minted here
            packageId: registered?.id ?? newPackageId(),
            quantity: registered?.quantity ?? (parseFloat(quantity) || 0),
            tap: tap || null,
        });

        pickedKey = "";
        onDone?.();
    }
</script>

<form class="inline-form" onsubmit={submit}>
    <div class="input-pair">
        <label for="unseal.itemKey">{m["baroo.staff.unseal_item"]()}</label>
        {#if lockedItemKey}
            <output id="unseal.itemKey" class="form-control-plaintext">{item?.name ?? lockedItemKey}</output>
        {:else}
            <select class="form-select" id="unseal.itemKey"
                value={pickedKey} onchange={pickItem} required
            >
                <option value="" disabled>—</option>
                {#each store.offerItems as offer (offer.key)}
                    <option value={offer.key}>{offer.name}</option>
                {/each}
            </select>
        {/if}
    </div>

    {#if measure && packages.length}
        <div class="input-pair">
            <label for="unseal.package">{m["baroo.staff.unseal_package"]()}</label>
            <select class="form-select" id="unseal.package" bind:value={packageId}>
                <option value="">{m["baroo.staff.unseal_package_new"]()}</option>
                {#each packages as offerPackage (offerPackage.id)}
                    <option value={offerPackage.id}>{packageLabel(offerPackage, measure)}{offerPackage.tagSerial ? " 📶" : ""}</option>
                {/each}
            </select>
        </div>
    {/if}

    {#if !packageId}
        <div class="input-pair">
            <label for="unseal.quantity">{m["baroo.staff.unseal_quantity"]({ measure: measure ? measureLabel(measure) : "..." })}</label>
            <input
                id="unseal.quantity" class="form-control"
                type="number"
                inputmode={measure === "volume" ? "decimal" : "numeric"}
                min={measure === "volume" ? 0.1 : 1}
                step={measure === "volume" ? 0.1 : 1}
                onfocus={(e) => e.currentTarget.select()}
                bind:value={quantity}
                required
            />
        </div>
    {/if}

    <div class="input-pair">
        <label for="unseal.tap">{m["baroo.staff.unseal_tap"]()}</label>
        {#key itemKey}
            <TapPicker id="unseal.tap" {taps} offerItems={store.offerItems} bind:value={tap} />
        {/key}
    </div>

    {#if replaced?.package}
        <p class="form-text">
            {m["baroo.staff.unseal_flush_current_hint"]({
                name: replaced.item.name,
                left: formatQuantity(replaced.measure, replaced.left ?? 0),
            })}
        </p>
    {/if}

    <button class="btn btn-primary" type="submit" disabled={!itemKey}>
        {m["baroo.staff.unseal_submit"]()}
    </button>
</form>
