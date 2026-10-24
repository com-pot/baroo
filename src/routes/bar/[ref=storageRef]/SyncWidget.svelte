<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { StoredOp } from "$lib/offline/op";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { getRenderer } from "$lib/rendering.svelte";
    import type StoreSync from "$lib/offline/StoreSync.svelte";

    const renderer = getRenderer()

    let {
        store,
        barSync,
    }: {
        store: BarOfflineStore,
        barSync?: StoreSync,
    } = $props();

    const formatTime = (iso: string) => new Date(iso).toLocaleString();

    function describeOp(op: StoredOp): string {
        switch (op.kind) {
            case "order":
                return m["baroo.staff.op_order"]({ who: op.memberLabel });
            case "tag-mapping":
                return m["baroo.staff.op_mapping"]({ serialId: op.serialId, nickName: op.nickName });
            case "settlement":
                return m["baroo.staff.op_settlement"]({
                    nickName: op.memberLabel,
                    amountPaid: renderer.formatCurrency("czk", op.amountPaid),
                });
            case "member-create":
                return m["baroo.staff.op_member"]({
                    nickName: op.nickName,
                    seq: String(op.memberSeq),
                });
            case "unseal":
                return m["baroo.staff.op_unseal"]({ offerItem: op.offerItemName });
            case "device-config":
                return m["baroo.staff.op_device_config"]();
        }
    }

    function opDetail(op: StoredOp): string {
        if (op.kind !== "order") return "";
        return op.items.map((item) => `${item.key}/${item.variant}`).join(", ");
    }

    async function voidOp(op: Pick<StoredOp, "seq">) {
        if (!confirm(m["baroo.staff.void_confirm"]())) return;
        await store.voidOp(op.seq);
    }
</script>

<section>
    <p class="meta">
        {#if store.snapshot}
            {m["baroo.offline.snapshot_age"]({ age: formatTime(store.snapshot.capturedAt) })}
        {:else}
            {m["baroo.offline.snapshot_missing"]()}
        {/if}
        ·
        {store.pending.length
            ? m["baroo.offline.pending"]({ count: String(store.pending.length) })
            : m["baroo.offline.pending_none"]()}
    </p>

    {#if !store.lineCheck.online}
        <p class="alert alert-warning">
            {m["baroo.staff.sync_offline"]()}
            {#if store.lineCheck.heartbeatError}<span class="detail">{store.lineCheck.heartbeatError}</span>{/if}
        </p>
    {/if}

    {#if barSync?.lastError}
        <p class="alert alert-danger">{barSync.lastError}</p>
    {/if}

    {#if barSync?.lastSyncResults}
        <p class="alert alert-info">
            {m["baroo.staff.sync_result"]({
                applied: barSync.lastSyncResults.applied.length,
                duplicate: barSync.lastSyncResults.duplicate.length,
                failed: barSync.lastSyncResults.failed.length,
            })}
        </p>
    {/if}

    <div class="actions">
        <button
            class="btn btn-primary"
            onclick={() => barSync?.push()}
            disabled={!store.lineCheck.online || !!barSync?.syncing}
        >
            {barSync?.syncing === "push" ? m["baroo.staff.pushing"]() : m["baroo.staff.push"]()}
        </button>
        <button
            class="btn btn-outline-primary"
            onclick={() => barSync?.pull()}
            disabled={!store.lineCheck.online || !!barSync?.syncing}
        >
            {barSync?.syncing === "pull" ? m["baroo.staff.pulling"]() : m["baroo.staff.pull"]()}
        </button>
    </div>
</section>

<section>
    <h3>{m["baroo.staff.pending_section"]()}</h3>

    {#if !store.pending.length}
        <p class="meta">{m["baroo.staff.pending_empty"]()}</p>
    {:else}
        <ul class="op-list">
            {#each store.pending as op (op.clientId)}
                <li class:failed={!!op.error}>
                    <div class="op-body">
                        <strong>{describeOp(op)}</strong>
                        {#if opDetail(op)}<span class="detail">{opDetail(op)}</span>{/if}
                        <span class="meta">{formatTime(op.occurredAt)}</span>
                        {#if op.error}
                            <span class="error">{m["baroo.staff.op_failed"]({ error: op.error })}</span>
                        {/if}
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick={() => voidOp(op)}>
                        {m["baroo.staff.void"]()}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</section>
