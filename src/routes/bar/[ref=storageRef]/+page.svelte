<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { page } from "$app/state";

    import type { PageData } from "./$types";
    import { onMount } from "svelte";
    import { Boot } from "$lib/boot";
    import { greetingFor, orderConfirmation } from "$lib/pos/device";
    import { listenForKeyboardWedge } from "$lib/pos/keyboardWedge";
    import { normalizeTag, type TagMapping } from "$lib/bar/tags";
    import { offeredServings, servingPreset, type Serving } from "$lib/bar/servings";
    import { formatQuantity } from "$lib/bar/quantity";
    import { Narrator } from "$lib/speech.svelte";
    import OfferStockBoard from "./OfferStockBoard.svelte";
    import Gzt from "$lib/eggs/Gzt.svelte";
    import WallClock from "./WallClock.svelte";
    import MemberSummary from "./MemberSummaryDialogContent.svelte";
    import { getUiLayers, type UiLayer } from "$lib/ui/uiLayers.svelte";
    import StaffDrawer from "./StaffDrawer.svelte";
    import NewOrderDialogContent from "./NewOrderDialogContent.svelte";
    import UnsealWidget from "./UnsealWidget.svelte";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import type { Measure } from "$lib/si/measure";
    import { TapStream, type HeardTap } from "$lib/taps/tapStream.svelte";
    import {
        TAP_ORDER_PREFIX,
        TAP_STALE_MS,
        TAP_UNSEAL_PREFIX,
        type OfferServedEvent,
        type PendingOfferEvent,
        type TapEvent,
        type TapUnsealedEvent,
    } from "$lib/taps/tapEvents";
    import PendingOffersModal, { type PendingOrder } from "./PendingOffersModal.svelte";
    import TapLineup from "./TapLineup.svelte";
    import TapBadge from "./TapBadge.svelte";

    const uiLayers = getUiLayers()

    const {
        data,
    }: {
        data: PageData;
    } = $props();

    const store = $derived(data.bar);
    const debug = $derived(page.url.searchParams.get('debug') || '')

    const modes = [
        {
            name: "order",
            label: m["baroo.bar.pos.action.order"],
        },
        {
            name: "summary",
            label: m["baroo.bar.pos.action.summary"],
        },
    ] as const

    let mode = $state<typeof modes[number]["name"]>("order");
    let userIdInput = $state("");
    function selectMode(opt: typeof modes[number]) {
        if (userIdInput.length) {
            return handleEntry(userIdInput, opt.name)
        }
        mode = opt.name
    }

    let narrationEnabled = $derived(!!store.config.greetingTemplate.trim());

    function startOrder(mapping: TagMapping, onDestroyed: () => unknown) {
        const layer = uiLayers.pushComponent(NewOrderDialogContent, {
            store,
            activeMapping: mapping,
            items: [],
            onOrderDone() {
                if (narrationEnabled) narrator?.speak(orderConfirmation());
                layer.ctrl.close()
            },
        }, { scope: "dialog", onDestroyed })

        return layer
    }

    function showSummary(mapping: TagMapping, onDestroyed: () => unknown) {
        const timeline = store.timeline(mapping.member.id);
        const lastSettlement = timeline.find((entry) => entry.type === 'settlement');

        const items = timeline
            .filter((entry) => entry.type === 'order')
            .filter((entry) => !lastSettlement || entry.date > lastSettlement.date)
            .map((entry) => entry.data);

        return uiLayers.pushComponent(MemberSummary, {
            store,
            items,
            activeMapping: mapping,
            enableSettlement: store.isStaffDevice,
        }, {
            scope: "dialog",
            onDestroyed,
        })
    }

    let status = $state<{ level: "✅" | "ℹ️" | "⚠️" | "❌"; text: string }>();
    function setStatus(
        level: NonNullable<typeof status>["level"],
        text: NonNullable<typeof status>["text"],
    ) {
        status = { level, text };
    }

    const BADGE_NUMBER = /^\d{1,5}$/;
    let currentDialog = $state<{ layer: UiLayer, id: string }|null>(null)
    function handleEntry(raw: string, action: typeof modes[number]["name"]) {
        if (currentDialog) {
            return;
        }

        const mapping = store.findMapping(normalizeTag(raw), store.config.idInput.includes("member"));

        if (!mapping) {
            reportUnknown(raw);
            return;
        }

        const displayName = mapping.member.nickName || "???";
        greet(mapping, displayName);

        userIdInput = ""
        if (action === "summary") {
            currentDialog = {
                layer: showSummary(mapping, () => currentDialog = null),
                id: mapping.member.id
            };
            return;
        }

        currentDialog = {
            layer: startOrder(mapping, () => currentDialog = null),
            id: mapping.member.id
        }
    }

    function reportUnknown(raw: string) {
        if (narrationEnabled) narrator?.speak("Cožeto? Neznám!")

        if (BADGE_NUMBER.test(raw)) {
            setStatus("⚠️", m["baroo.bar.status.unknown_member_seq"]({ seq: raw }));
            return;
        }

        store.noteUnknownTag(raw);
        setStatus("⚠️", m["baroo.bar.status.unknown_tag"]({ serialId: raw }));
    }

    function greet(mapping: TagMapping, displayName: string) {
        const greeting = greetingFor(store.config, {
            nickName: displayName,
            greeting: typeof mapping.extra?.greeting === "string" ? mapping.extra.greeting : undefined,
        });
        if (greeting) narrator?.speak(greeting);
    }

    /** Kept apart from the dialog layers - several customers can wait at the taps at once */
    let pendingOrders = $state<PendingOrder[]>([]);
    let tapStream = $state<TapStream | undefined>();

    function onTapEvent(event: TapEvent) {
        switch (event.type) {
            case "pending-offer":
                receivePendingOffer(event);
                return;
            case "offer-served":
                offerServed(event);
                return;
            case "offer-dismissed":
                dropPendingOrder(event.id);
                return;
            case "tap-unsealed":
                void unsealAtTap(event);
                return;
            case "tap-unset":
                setStatus("⚠️", m["baroo.bar.status.tap_unset"]({ tap: event.tap }));
                return;
        }
    }

    /** Staff kiosks file the package right away, every one of them under the same clientId */
    async function unsealAtTap(event: TapUnsealedEvent) {
        setStatus("ℹ️", m["baroo.bar.status.tap_unsealed"]({
            tap: event.tap,
            name: event.offerItemName,
            package: event.packageLabel,
        }));

        const clientId = `${TAP_UNSEAL_PREFIX}${event.id}`;
        if (!store.isStaffDevice || store.hasOp(clientId)) return;

        try {
            await store.process("unseal", {
                clientId,
                occurredAt: event.at,
                offerItemKey: event.offerItemKey,
                offerItemName: event.offerItemName,
                quantity: event.quantity,
                tap: event.tap,
                packageId: event.packageId,
                flushCurrent: true,
            });
        } catch (error) {
            console.error(error);
            setStatus("❌", m["baroo.bar.status.tap_unseal_failed"]({ tap: event.tap, error: errorText(error) }));
        }
    }

    function receivePendingOffer(offer: PendingOfferEvent) {
        if (pendingOrders.some((pending) => pending.id === offer.id)) return;

        const order = pendingOrderOf(offer);
        if (!order) {
            reportUnknown(offer.serialId);
            return;
        }

        greet(order.mapping, order.label);
        pendingOrders = [...pendingOrders, order];
    }

    function pendingOrderOf(offer: Pick<PendingOfferEvent, "id" | "tap" | "serialId" | "offerItemKey">): PendingOrder | null {
        const mapping = store.findMapping(offer.serialId);
        if (!mapping) return null;

        return {
            id: offer.id,
            tap: offer.tap,
            mapping,
            label: mapping.member.nickName || "???",
            offerItemKey: offer.offerItemKey,
        };
    }

    async function servePendingOrder(order: PendingOrder, item: BarOfferItem, serving: Serving, occurredAt?: string) {
        // Removed before the outbox write so a double press can't pour twice
        dropPendingOrder(order.id);

        try {
            await store.process("order", {
                // Kiosks answering the same offer land one order, sync dedupes on clientId
                clientId: `${TAP_ORDER_PREFIX}${order.id}`,
                occurredAt,
                serialId: order.mapping.serialId,
                memberId: order.mapping.member.id,
                memberLabel: order.label,
                items: [{ key: item.key, variant: serving.key }],
            });
        } catch (error) {
            console.error(error);
            pendingOrders = [order, ...pendingOrders];
            setStatus("❌", m["baroo.bar.status.pending_order_failed"]({
                name: order.label,
                error: errorText(error),
            }));
            return;
        }

        setStatus("✅", m["baroo.offline.pending"]({ count: String(store.pending.length) }));
        if (narrationEnabled) narrator?.speak(orderConfirmation());
    }

    /**
     * Served on another kiosk, which filed the order - or at the TapTapper, then every kiosk
     * files it, even one that came along after the card was tapped
     */
    function offerServed(event: OfferServedEvent) {
        const filed = event.source === "kiosk" || store.hasOp(`${TAP_ORDER_PREFIX}${event.id}`);
        const order = pendingOrders.find((pending) => pending.id === event.id) ?? pendingOrderOf(event);
        if (filed || !order) {
            dropPendingOrder(event.id);
            return;
        }

        const item = store.offerItems.find((candidate) => candidate.key === event.offerItemKey);
        const serving = item && offeredServings(item).find((candidate) => candidate.key === event.variant);
        if (!item || !serving) {
            setStatus("⚠️", m["baroo.bar.status.tap_size_unavailable"]({ tap: event.tap }));
            return;
        }

        void servePendingOrder(order, item, serving, event.at);
    }

    function dismissPendingOrder(order: PendingOrder) {
        dropPendingOrder(order.id);
        void tapStream?.dismiss(order.id);
    }

    function dropPendingOrder(id: string) {
        pendingOrders = pendingOrders.filter((pending) => pending.id !== id);
    }

    /** The taps this device knows of, from the venue server and from its own data */
    const knownTaps = $derived([
        ...(tapStream?.taps ?? []).map((state) => ({ tap: state.tap, offerItemKey: state.offerItemKey })),
        ...store.taps.map((assignment) => ({ tap: assignment.tap, offerItemKey: assignment.offerItemKey })),
    ]);

    function openUnseal(opts: { itemKey?: string, tap?: string }) {
        const item = opts.itemKey ? store.barOffer[opts.itemKey] : undefined;
        const layer = uiLayers.pushComponent(UnsealWidget, {
            store,
            lockedItemKey: item?.key,
            tap: opts.tap,
            taps: knownTaps,
            onDone: () => uiLayers.close(layer.id),
        }, {
            heading: `${m["baroo.bar.stock.unseal_new"]()} — ${item?.name ?? m["baroo.bar.tap.title"]({ tap: opts.tap ?? "" })}`,
        });
    }

    async function flushOffer(item: BarOfferItem, left: { measure: Measure, quantity: number | null }, tap?: string) {
        const confirmed = confirm(m["baroo.bar.stock.flush_confirm"]({
            name: item.name,
            left: left.quantity === null ? "?" : formatQuantity(left.measure, left.quantity),
        }));
        if (!confirmed) return;

        try {
            await store.process("flush", {
                offerItemKey: item.key,
                offerItemName: item.name,
                tap: tap ?? null,
            });
        } catch (error) {
            console.error(error);
            setStatus("❌", errorText(error));
        }
    }

    // Ticks so TapTappers that went quiet show as stale on the stock board
    let now = $state(Date.now());
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 5_000);
        return () => clearInterval(timer);
    });

    function tapperAlive(tap: string): boolean | null {
        const heardAt = tapStream?.taps.find((state) => state.tap === tap)?.heardAt ?? null;
        if (heardAt === null) return null;
        return !!tapStream?.connected && now - heardAt < TAP_STALE_MS;
    }

    function errorText(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    function submitSelectForm(e: SubmitEvent) {
        e.preventDefault();
        handleEntry(userIdInput, mode);
    }

    function handleScan(raw: string) {
        handleEntry(raw, mode);
    }

    let narrator = $state<Narrator | undefined>();

    const boot = new Boot([
        {
            name: "bar-data",
            init: async () => {
                if (!store.snapshot) {
                    throw new Error("No offline data for this bar — connect and prime the device.");
                }
                return `${store.offerItems.length} items, ${store.mappings.length} tags`;
            },
        },
        {
            name: "nfc",
            isEnabled: () => typeof NDEFReader !== "undefined",
            init: async () => {
                const ndef = new NDEFReader();
                await ndef.scan();

                ndef.onreadingerror = () => {
                    setStatus("❌", m["baroo.bar.status.tag_unreadable"]());
                };
                ndef.onreading = (event) => handleScan(event.serialNumber);
            },
        },
        {
            name: "narrator",
            init: async () => {
                narrator = new Narrator({
                    exclude: {
                        langs: [
                            "da-DK",
                            "ca-ES",
                            "zh-CN",
                            "yue-HK",
                            "tr-TR",
                            "th-TH",
                            "ru-RU",
                            "ko-KR",
                            "ja-JP",
                            "he-IL",
                            "ms-MY",
                            "kn-IN",
                            "pt-BR",
                            "pt-PT",
                            "sv-SE",
                            "sl-SI",
                            "uk-UA"
                        ],
                    },
                })
                narrator.init()

                const globalThis = (window as unknown as Record<string, unknown>);
                globalThis.speak = (text: string) => narrator?.speak(text)
                console.debug("Narrator initialized as the speak(\"\") function")
                return narrator
            },
        },
        {
            name: "taps",
            // After the narrator, so the first offer already gets its greeting
            isEnabled: () => !!store.device?.tapTicket,
            init: async () => {
                const stream = new TapStream({
                    barSlug: store.barSlug,
                    ticket: () => store.device?.tapTicket ?? null,
                    onEvent: onTapEvent,
                });
                tapStream = stream;

                const stopRelaying = store.onOp((op) => stream.relay(op));
                // Not awaiting the connection, it keeps retrying in the background
                const stop = stream.start();

                return () => {
                    stopRelaying();
                    stop();
                };
            },
        },
    ], {
        stepInitMinMs: 137,
    });

    function openStaffDrawer() {
        uiLayers.pushComponent(StaffDrawer, {store}, {
            heading: `${m["baroo.staff.title"]()} — ${store.snapshot?.bar.name}`
        })
    }

    onMount(() => () => boot.destroy());
    onMount(() => listenForKeyboardWedge(document, { onScan: handleScan }))
</script>

<main class="grid-stack" data-theme={store.config.theme}>
    <WallClock />

    <div class="main-content">
        <div class="card -title">
            <div class="card-body">
                <h1>{m["baroo.page_front.title"]({ barName: store.snapshot?.bar?.name || store.snapshot?.bar?.slug || "" })}</h1>
            </div>
        </div>
        <div class="card -form grid-stack">
            <div class="card-body" data-boot-init>
                <button class="btn btn-xl btn-primary" onclick={() => boot.run()}>Tak to rozjedem</button>
            </div>
            <form name="selectBadgeForm" class="card-body" onsubmit={submitSelectForm} data-boot>
                {#if store.config.idInput}
                <div class="form-section" data-name="serialId">
                    <div class="input-group input-group-lg">
                        <input
                            name="serialId"
                            id="serialId"
                            class="form-control"
                            required
                            aria-label={m["baroo.bar.userRef"]()}
                            inputmode={store.config.idInput === "member-serial" ? "text" : "numeric"}
                            bind:value={userIdInput}
                        />
                    </div>
                </div>
                {/if}
                <div class="form-section" data-name="submitMode">
                    <div class="btn-group">
                        {#each modes as opt (opt.name)}
                        <button class="btn btn-baroo {opt.name === mode ? 'btn-primary' : 'btn-outline-primary'}"
                            type="button"
                            onclick={() => selectMode(opt)}
                        >
                            <span class="text">{opt.label()}</span>
                        </button>
                        {/each}
                    </div>
                </div>
            </form>
        </div>
        <div class="card -info">
            <div class="card-footer">
                {#if store.deviceLabel}
                    <span class="device-name">{store.deviceLabel}</span>
                {/if}
                {#if store.isStaffDevice && store.snapshot}
                    <span role="separator">⊙</span>
                    <button type="button" class="btn btn-link btn-text"
                        onclick={() => openStaffDrawer()}>
                        {m["baroo.staff.title"]()}
                    </button>
                {/if}
            </div>
        </div>

        <div class="info-sections" data-boot>
            {#if status?.text}
                <div class="form-status" data-level={status.level}>
                    <span class="level">{status.level}</span>
                    <span class="text">{status.text}</span>
                </div>
            {/if}

            {#if store.config.genZToy}
                <Gzt {debug} />
            {/if}
        </div>

        {#if tapStream}
            <TapLineup stream={tapStream} offerItems={store.offerItems}
                actionsMenu={store.isStaffDevice ? tapActions : undefined}
            />
        {/if}

        {#if store.isStaffDevice}
            <OfferStockBoard {store}>
                {#snippet tapBadge(tap)}
                    <TapBadge {tap} alive={tapperAlive(tap)} />
                {/snippet}
                {#snippet actionsMenu(entry, btnAttrs)}
                    <li>
                        <button
                            type="button"
                            {...btnAttrs}
                            onclick={() => openUnseal({ itemKey: entry.item.key })}
                        >
                            {m["baroo.bar.stock.unseal_new"]()}
                        </button>
                    </li>
                    {#if entry.unsealedAt}
                        <li>
                            <button
                                type="button"
                                {...btnAttrs}
                                onclick={() => flushOffer(entry.item, { measure: entry.measure, quantity: entry.left }, entry.taps[0])}
                            >
                                {m["baroo.bar.stock.flush"]()}
                            </button>
                        </li>
                    {/if}
                {/snippet}
            </OfferStockBoard>
        {/if}
    </div>
</main>

{#snippet tapActions(tap: HeardTap, btnAttrs: Record<string, unknown>)}
    {@const item = tap.offerItemKey ? store.barOffer[tap.offerItemKey] : undefined}
    <li>
        <button
            type="button"
            {...btnAttrs}
            onclick={() => openUnseal({ tap: tap.tap })}
        >
            {m["baroo.bar.tap.unseal_onto"]()}
        </button>
    </li>
    {#if item}
        <li>
            <button
                type="button"
                {...btnAttrs}
                onclick={() => flushOffer(item, {
                    measure: servingPreset(item.servingPreset).measure,
                    quantity: tap.stock?.left ?? null,
                }, tap.tap)}
            >
                {m["baroo.bar.stock.flush"]()}
            </button>
        </li>
    {/if}
{/snippet}

<PendingOffersModal
    orders={pendingOrders}
    offerItems={store.offerItems}
    onServe={servePendingOrder}
    onDismiss={dismissPendingOrder}
/>

<style lang="scss">
@property --hide-rate {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
}

.card {
    transition: translate 0.5s;
    --hide-rate: 1;

    &.-title {
        --bs-card-spacer-y: 0.25rem;
        text-align: center;
        margin: 0 1rem calc(-1 * var(--bs-card-spacer-y));

        translate: 0 calc(var(--hide-rate) * 100%);
        transition-delay: 0.2s;

        h1 {
            margin: 0;
        }
    }
    &.-form {
        z-index: 1;
    }
    &.-info {
        margin: calc(-1 * var(--bs-card-inner-border-radius)) 1rem 0;

        translate: 0 calc(var(--hide-rate) * -100%);
        transition-delay: 0.4s;
    }
}
:global(body[data-boot-status="ready"]) {
    .card {
        --hide-rate: 0;
    }
}

.grid-stack {
    display: grid;
    > * {
        grid-area: 1 / 1;
    }
}
[data-boot-init] {
    z-index: 20;
    text-align: center;
    transition: all 0.4s ease-in-out;
    border-radius: inherit;

    & + form {
        z-index: 1;

        opacity: 1;
    }

    clip-path: polygon(
        0 0,
        0 calc(var(--hide-rate) * 100%),
        100% calc(var(--hide-rate) * 100%),
        100% 0,
    );
}

:global(body[data-boot-status="ready"]) {
    [data-boot-init] {
        opacity: 1;
        --hide-rate: 0;
        background-color: var(--bs-card-bg);
    }
}

.main-content h1 {
    @media (width <= 34rem) {
        padding-block-start: 2.5rem;
    }
}

.btn-xl {
    font-size: 3rem;
    height: 1px;
    min-height: 100%;
    width: 1px; min-width: 100%;

    display: grid;
    place-content: center;
}
[data-name="submitMode"] {
    flex: 1;
    .btn-group { flex: 1; }
}

:global(.wall-clock) {
    position: fixed;
    inset-block-start: 0.5rem;
    inset-inline-start: 0.5rem;
    z-index: 50;
}

:global(:is(.stock-board, .tap-lineup)) {
    margin-block-start: 2rem;

    width: min(72rem, calc(100vw - 2rem));
    position: relative;
    left: 50%;
    transform: translateX(-50%);
}
</style>
