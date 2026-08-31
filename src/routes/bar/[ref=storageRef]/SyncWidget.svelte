<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { StoredOp } from "$lib/offline/op";
    import type { OfflineBar } from "$lib/offline/store.svelte";

    /**
     * Sync controls and the queue behind them.
     *
     * Nothing here is part of serving a drink — ops push themselves, and connectivity is
     * already on the badge. It lives under "debugging" because that is when it is wanted:
     * a queue that will not drain, or a snapshot that needs forcing.
     */
    let { bar }: { bar: OfflineBar } = $props();
    const store = bar;

    const priceFormatter = new Intl.NumberFormat("cs", {
        style: "currency",
        currency: "czk",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    const formatTime = (iso: string) => new Date(iso).toLocaleString();

    const syncTally = $derived.by(() => {
        const results = store.lastSyncResults;
        if (!results) return null;
        return {
            applied: results.filter((r) => r.status === "applied").length,
            duplicate: results.filter((r) => r.status === "duplicate").length,
            failed: results.filter((r) => r.status === "failed").length,
        };
    });

    function describeOp(op: StoredOp): string {
        switch (op.kind) {
            case "order":
                return m["baroo.staff.op_order"]({ who: op.memberLabel });
            case "tag-mapping":
                return m["baroo.staff.op_mapping"]({ serialId: op.serialId, nickName: op.nickName });
            case "settlement":
                return m["baroo.staff.op_settlement"]({
                    nickName: op.memberLabel,
                    amountPaid: priceFormatter.format(op.amountPaid),
                });
            case "member-create":
                return m["baroo.staff.op_member"]({
                    nickName: op.nickName,
                    seq: String(op.memberSeq),
                });
            case "unseal":
                return m["baroo.staff.op_unseal"]({ offerItem: op.offerItemName });
        }
    }

    function opDetail(op: StoredOp): string {
        if (op.kind !== "order") return "";
        return op.items.map((item) => `${item.key}/${item.variant}`).join(", ");
    }

    async function voidOp(op: StoredOp) {
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

    {#if !store.online}
        <p class="alert alert-warning">{m["baroo.staff.sync_offline"]()}</p>
    {/if}

    {#if store.lastError}
        <p class="alert alert-danger">{store.lastError}</p>
    {/if}

    {#if syncTally}
        <p class="alert alert-info">
            {m["baroo.staff.sync_result"]({
                applied: String(syncTally.applied),
                duplicate: String(syncTally.duplicate),
                failed: String(syncTally.failed),
            })}
        </p>
    {/if}

    <div class="actions">
        <button
            class="btn btn-primary"
            onclick={() => store.push()}
            disabled={!store.online || !!store.syncing}
        >
            {store.syncing === "push" ? m["baroo.staff.pushing"]() : m["baroo.staff.push"]()}
        </button>
        <button
            class="btn btn-outline-primary"
            onclick={() => store.pull()}
            disabled={!store.online || !!store.syncing}
        >
            {store.syncing === "pull" ? m["baroo.staff.pulling"]() : m["baroo.staff.pull"]()}
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
