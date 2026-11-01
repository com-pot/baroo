<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { StoredOp } from "$lib/offline/op";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { getRenderer } from "$lib/rendering.svelte";
    import type StoreSync from "$lib/offline/StoreSync.svelte";
    import SnapshotDebugWidget from "./SnapshotDebugWidget.svelte";
    import CacheResetWidget from "./CacheResetWidget.svelte";

    const renderer = getRenderer()

    let {
        store,
        barSync,
    }: {
        store: BarOfflineStore,
        barSync: StoreSync,
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
                    amountPaid: renderer.formatCurrency(store.currency, op.amountPaid),
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

    function opDetail(op: StoredOp): string | undefined {
        if (op.kind === "order") {
            return op.items.map((item) => `${item.key}/${item.variant}`).join(", ");
        }
    }

    async function voidOp(op: Pick<StoredOp, "seq">) {
        if (!confirm(m["baroo.staff.void_confirm"]())) return;
        await store.voidOp(op.seq);
    }
</script>
<div class="flow-block">
    <section>
        <p class="text-meta">
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

        {#if barSync.lastError}
            <p class="alert alert-danger">{barSync.lastError.message}</p>
            {#if barSync.lastError.details}
            <code><pre>{JSON.stringify(barSync.lastError.details)}</pre></code>
            {/if}
        {/if}

        {#if barSync.lastSyncResults}
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
                onclick={() => barSync.requestSync("push")}
                disabled={!store.lineCheck.online || !!barSync.syncing}
            >
                {barSync.syncing === "push" ? m["baroo.staff.pushing"]() : m["baroo.staff.push"]()}
            </button>
            <button
                class="btn btn-outline-primary"
                onclick={() => barSync.requestSync("sync")}
                disabled={!store.lineCheck.online || !!barSync.syncing}
            >
                {barSync.syncing === "pull" ? m["baroo.staff.pulling"]() : m["baroo.staff.pull"]()}
            </button>
        </div>
    </section>

    <section>
        <h2>{m["baroo.staff.debug_section"]()}</h2>

        <div class="actions">
            <SnapshotDebugWidget {store} />
            <CacheResetWidget isOnline={() => store.lineCheck.online} />
        </div>
    </section>

    <section>
        <h3>{m["baroo.staff.pending_section"]()}</h3>

        {#if !store.pending.length}
            <p class="text-meta">{m["baroo.staff.pending_empty"]()}</p>
        {:else}
            <ul class="op-list">
                {#each store.pending as op (op.clientId)}
                    {@const detailText = opDetail(op)}
                    <li>
                        <div class="op-body">
                            <strong>{describeOp(op)}</strong>
                            {#if detailText}<span class="text-meta detail">{detailText}</span>{/if}
                            <time class="text-meta" datetime={op.occurredAt}>{formatTime(op.occurredAt)}</time>
                            {#if op.error}
                                <span class="error">{m["baroo.staff.op_failed"]({ error: op.error })}</span>
                            {/if}
                        </div>
                        <div class="actions">
                            <button class="btn btn-sm btn-icon btn-outline-danger"
                                onclick={() => voidOp(op)}
                                title={m["baroo.staff.void"]()}
                            >
                                <span role="presentation">⌫</span>
                            </button>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>
</div>

<style lang="scss">
.op-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    li {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.5rem 0.75rem;
        border: 1px solid rgb(0 0 0 / 0.1);
        border-radius: 0.5rem;

        &:has(.error) {
            border-color: var(--bs-danger);
        }

        .actions {
            position: absolute;
            inset-block-start: 0.5rem;
            inset-inline-end: 0.5rem;
        }
    }

    .op-body {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }

    .detail {
        word-break: break-word;
    }

    .error {
        font-size: 0.85rem;
        color: var(--bs-danger);
    }
}
</style>
