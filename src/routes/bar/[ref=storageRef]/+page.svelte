<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { browser } from "$app/environment";

    import type { PageData } from "./$types";
    import { onMount } from "svelte";
    import { Boot } from "$lib/boot";
    import { greetingFor, orderConfirmation } from "$lib/pos/device";
    import { listenForKeyboardWedge } from "$lib/pos/keyboardWedge";
    import { kioskPrefs } from "$lib/pos/kioskPrefs.svelte";
    import { normalizeTag, type TagMapping } from "$lib/bar/tags";
    import { servingsOf } from "$lib/bar/servings";
    import { Narrator } from "$lib/speech.svelte";
    import { ScannerEventStream } from "./scannerEventStream.svelte";
    import MessageStream from "./MessageStream.svelte";
    import OfferStockBoard from "./OfferStockBoard.svelte";
    import Gzt from "$lib/eggs/Gzt.svelte";
    import WallClock from "./WallClock.svelte";
    import type { BarOrderItem } from "$lib/bar/BarModel";
    import MemberSummary from "./MemberSummary.svelte";
    import { getUiLayers } from "$lib/ui/uiLayers.svelte";
    import StaffDrawer from "./StaffDrawer.svelte";

    const layerManager = getUiLayers()

    const {
        data,
    }: {
        data: PageData;
    } = $props();

    const store = $derived(data.bar);

    let debug = $state('')

    let status = $state<{ level: "✅" | "ℹ️" | "⚠️" | "❌"; text: string }>();
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

    let bar = $derived(store.snapshot?.bar ?? null);
    let narrationEnabled = $derived(!!store.config.greetingTemplate.trim());

    let orderDialog = $state<HTMLDialogElement>();
    let summaryDialog = $state<HTMLDialogElement>();

    type OrderItem = Pick<BarOrderItem, "key" | "variant">;

    const balanceCtrl = $state({
        activeMapping: null as null | TagMapping,
        /** Who the open dialog is about, plus the items it should display. */
        workingCopy: null as null | { id: string; label: string; items: OrderItem[] },
        currentOrder: null as null | { items: OrderItem[] },

        startOrder(mapping: TagMapping, label: string) {
            this.activeMapping = mapping;
            this.workingCopy = { id: mapping.serialId, label, items: [] };
            this.currentOrder = { items: [] };

            orderDialog!.showModal();
        },

        addToOrder(item: OrderItem) {
            if (!this.currentOrder) {
                setStatus("⚠️", m["baroo.bar.status.no_order"]());
                return;
            }
            this.currentOrder.items.push(item);
        },

        removeFromOrder(key: OrderItem["key"]) {
            if (!this.currentOrder) {
                setStatus("⚠️", m["baroo.bar.status.no_order"]());
                return;
            }
            this.currentOrder.items = this.currentOrder.items.filter(
                (item) => item.key !== key,
            );
        },

        hasItemsInOrder(key: OrderItem["key"]): boolean {
            return (this.currentOrder?.items || []).some((item) => item.key === key)
        },

        /**
         * Orders go into the local outbox, never straight to a server — underground
         * there isn't one. The barman's console pushes them once there is signal again.
         */
        async confirmOrder() {
            if (!this.workingCopy || !this.currentOrder) {
                setStatus("❌", m["baroo.bar.status.no_working_copy"]());
                return;
            }

            if (!this.currentOrder.items.length) {
                this.reset();
                return;
            }

            await store.process("order", {
                serialId: this.workingCopy.id,
                // Carried alongside the card so a badge-number order — where there is no
                // card to resolve — still lands on the right tab.
                memberId: this.activeMapping?.member.id,
                memberLabel: this.workingCopy.label,
                items: [...this.currentOrder.items],
            });

            setStatus("✅", m["baroo.offline.pending"]({ count: String(store.pending.length) }));
            // Said after the order is stored, not before: the line is a receipt, so it
            // must not go out for an order that failed to land in the outbox.
            if (narrationEnabled) narrator?.speak(orderConfirmation());
            this.reset();
        },

        /** Summary is the unsettled tab, computed from snapshot + outbox. */
        showSummary(mapping: TagMapping, label: string) {
            this.activeMapping = mapping;

            const timeline = store.timeline(mapping.member.id);
            const lastSettlement = timeline.find((entry) => entry.type === 'settlement');

            const items = timeline
                .filter((entry) => entry.type === 'order')
                .filter((entry) => !lastSettlement || entry.date > lastSettlement.date)
                .map((entry) => entry.data as OrderItem);

            this.workingCopy = { id: mapping.serialId, label, items };

            summaryDialog!.showModal();
        },

        reset() {
            this.workingCopy = null;
            this.currentOrder = null;
            this.activeMapping = null;
            userIdInput = "";
            mode = "order"
        },
    });

    const currentOrderCounts = $derived.by(() => {
        const counts: Record<string, number> = {};
        for (const item of balanceCtrl.currentOrder?.items || []) {
            const key = `${item.key}-${item.variant}`;
            counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
    });

    function setStatus(
        level: NonNullable<typeof status>["level"],
        text: NonNullable<typeof status>["text"],
    ) {
        status = { level, text };
    }

    /**
     * What the barman typed, or what the reader picked up.
     *
     * Cards are long hex; the number printed on a badge is a handful of digits, so a
     * bare short number is read as a badge. The card lookup still runs first, in case a
     * reader ever hands us an all-numeric serial.
     */
    const BADGE_NUMBER = /^\d{1,5}$/;

    function resolveEntry(raw: string): TagMapping | null {
        const serialId = normalizeTag(raw);

        const byCard = store.findMapping(serialId);
        if (byCard) return byCard;

        if (!BADGE_NUMBER.test(serialId)) return null;

        const member = store.findMemberBySeq(Number(serialId));
        if (!member) return null;

        // Members enrolled without a card still drink — the order names them by id.
        const foundMapping = store.findMappingByMember(member.id)
        if (foundMapping) return foundMapping

        return {
            serialId: "",
            member: {
                id: member.id,
                nickName: member.nickName,
                seq: member.seq,
            },
            extra: {
                avatar_1x1: member.avatar_1x1 ?? "",
                greeting: member.greeting,
            },
        }
    }

    /**
     * The one way in. Whether the id was typed, tapped on the tablet's own NFC, or
     * pushed up from a PC/SC reader, it lands here and is treated identically.
     */
    function handleEntry(raw: string, action: typeof modes[number]["name"]) {
        const mapping = resolveEntry(raw);

        if (!mapping) {
            if (narrationEnabled) narrator?.speak("Cožeto? Neznám!")

            // A mistyped badge number is not a card — putting it on the staff console's
            // to-do list would only give them a phantom to chase.
            if (BADGE_NUMBER.test(raw)) {
                setStatus("⚠️", m["baroo.bar.status.unknown_member_seq"]({ seq: raw }));
                return;
            }

            store.noteUnknownTag(raw);
            setStatus("⚠️", m["baroo.bar.status.unknown_tag"]({ serialId: raw }));
            return;
        }

        const displayName = mapping.member.nickName || "???";
        // `null` when this device has no greeting template — narration is off entirely.
        const greeting = greetingFor(store.config, {
            nickName: displayName,
            greeting: typeof mapping.extra?.greeting === "string" ? mapping.extra.greeting : undefined,
        });
        if (greeting) narrator?.speak(greeting);

        if (action === "summary") {
            balanceCtrl.showSummary(mapping, displayName);
            return;
        }

        balanceCtrl.startOrder(mapping, displayName);
    }

    function submitSelectForm(e: SubmitEvent) {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.target as HTMLFormElement).entries());

        handleEntry(
            String(formData.serialId || ""),
            formData.action === "summary" ? "summary" : "order",
        );
    }

    /**
     * A tap on a reader, from whichever of them is present. It obeys the order/summary
     * buttons exactly as the id field does, and is refused while a dialog is already
     * open — a card brushing the reader twice must not discard a half-built order.
     */
    function handleScan(raw: string) {
        if (balanceCtrl.workingCopy) {
            setStatus("ℹ️", m["baroo.bar.status.processing"]({ userId: balanceCtrl.workingCopy.id }));
            return;
        }

        try {
            handleEntry(raw, mode);
        } catch (error) {
            console.error(error);
            setStatus("❌", m["baroo.bar.status.error_processing"]({
                serialId: normalizeTag(raw),
                error: error instanceof Error ? error.message : String(error),
            }));
        }
    }

    /**
     * A USB PC/SC reader (Akasa, ACR122U, any CCID device) is invisible to the browser
     * — WebUSB refuses to claim the smart-card interface class — so it is read by
     * `nfc-pcsc` on whichever machine it is plugged into and pushed here over SSE.
     * Kept out of boot: a venue with no such server still has a working till.
     */
    const scannerEventStream = new ScannerEventStream(data.ref, {
        historySize: 5,
        onMessage(message) {
            const [, kind, payload] = message.match(/^([a-z-]+):([\s\S]*)$/) ?? [];

            if (kind === 'card') {
                handleScan(payload);
            } else if (kind === 'reader-detected') {
                setStatus("✅", m["baroo.bar.status.reader_ready"]({ reader: payload }));
            } else if (kind === 'reader-error' || kind === 'pcsc-error' || kind === 'reader-reset-failed') {
                setStatus("❌", m["baroo.bar.status.reader_error"]({ error: payload }));
            } else if (kind === 'reader-removed') {
                // Worth saying out loud rather than letting taps quietly do nothing:
                // the manual id input is right there, and a bartender who knows the
                // reader is gone uses it instead of tapping harder.
                setStatus("⚠️", m["baroo.bar.status.reader_gone"]({ reader: payload }));
            } else if (kind === 'reader-unhealthy') {
                setStatus("⚠️", m["baroo.bar.status.reader_stalled"]({ detail: payload }));
            } else if (kind === 'reader-resetting') {
                setStatus("ℹ️", m["baroo.bar.status.reader_resetting"]());
            }
        },
    });

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
            // No Web NFC means no reader to bring up. The kiosk falls back to the manual
            // id input, which is a working till, not a broken one.
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
            // An empty greeting template means this kiosk stays silent, so there is no
            // reason to start the voice engine — or to show a step for it.
            isEnabled: () => narrationEnabled,
            init: async () => {
                const instance = new Narrator({
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
                instance.init()
                narrator = instance

                const globalThis = (window as unknown as Record<string, unknown>);
                globalThis.speak = (text: string) => {
                    const result = instance.speak(text)
                    console.log(result)
                }
                console.debug("Narrator initialized as the speak(\"\") function")
                return instance
            },
        },
    ], {
        stepInitMinMs: 137,
    });

    onMount(() => {
        let unsubscribeScanner: (() => void) | undefined;
        try {
            unsubscribeScanner = scannerEventStream.init();
        } catch (err) {
            console.debug("No scanner stream (expected with no server):", err);
        }

        const url = new URL(window.location.toString())
        debug = url.searchParams.get('debug') || ''

        return () => {
            unsubscribeScanner?.();
            boot.destroy()
        };
    });

    // The only external reader a tablet browser can hear. Always armed: there is
    // no way to ask whether one is plugged in, and with none attached it costs a
    // discarded keystroke — the barman's typing is far too slow to reach it.
    onMount(() => listenForKeyboardWedge(document, { onScan: handleScan }))
</script>

<main class="grid-stack" data-theme={store.config.theme}>
    <WallClock />

    <div class="main-content">
        <div class="card -title">
            <div class="card-body">
                <h1>{m["baroo.page_front.title"]({ barName: bar?.name || bar?.slug || "" })}</h1>
            </div>
        </div>
        <div class="card -form grid-stack">
            <div class="card-body" data-boot-init>
                <button class="btn btn-xl btn-primary" onclick={() => boot.run()}>Tak to rozjedem</button>
            </div>
            <form name="selectBadgeForm" class="card-body" onsubmit={submitSelectForm} data-boot>
                {#if store.config.idInput}
                <div class="form-section">
                    <div class="input-group input-group-lg">
                        <input
                            name="serialId"
                            id="serialId"
                            class="form-control"
                            required
                            aria-label={m["baroo.bar.userRef"]()}
                            inputmode={kioskPrefs.idInputMode}
                            bind:value={userIdInput}
                            placeholder={m["baroo.bar.pos.id_input_placeholder"]()}
                        />
                    </div>
                </div>
                {/if}
                <div class="form-section">
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
                    <button type="button" class="btn btn-link btn-text" onclick={() => (
                        layerManager.pushComponent(StaffDrawer, { bar: store}, {
                            heading: `${m["baroo.staff.title"]()} — ${store.snapshot?.bar.name}`
                        })
                    )}>
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

        {#if store.isStaffDevice}
            <OfferStockBoard bar={store} />
        {/if}

        {#if debug?.includes('stream')}<MessageStream stream={scannerEventStream} />{/if}
    </div>
</main>

{#if browser}
<dialog
    id="orderDialog"
    bind:this={orderDialog}
    onclose={() => balanceCtrl.reset()}
>
    <button
        class="accent-warning"
        data-action="close"
        aria-label={m["baroo.bar.order.cancel"]()}
        onclick={() => orderDialog!.close()}>✖</button
    >
    <div class="card">
        <div class="card-header">
            <img
                class="avatar-1x1"
                src={balanceCtrl.activeMapping?.extra?.avatar_1x1
                    ? `/storage/api/files/bar_members/${balanceCtrl.activeMapping.member.id}/${balanceCtrl.activeMapping.extra.avatar_1x1}`
                    : '/assets/default-badge.svg'
                }
                alt=""
            />
            <h2>
                {m["baroo.bar.order.title_new"]({ userName: balanceCtrl.workingCopy?.label || "" })}
            </h2>
        </div>
        <div class="card-body offer">
            {#each store.offerItems as item (item.key)}
                {@const servings = servingsOf(item).filter((serving) => item.pricing?.[serving.key] != null)}
                <div class="item" data-key={item.key}>
                    <span class="item-name">{item.name}</span>
                    {#if item.preview_1x1}
                        <div class="frame preview" title={JSON.stringify(item)}>
                            <img src={`/storage/api/files/bar_offer_items/${item.id}/${item.preview_1x1}`} alt="" />
                        </div>
                    {/if}
                    <div class="variants">
                        {#each servings as serving (serving.key)}
                            <button
                                data-value={serving.key}
                                onclick={() => balanceCtrl.addToOrder({ key: item.key, variant: serving.key })}
                            >
                                <span class="amount"
                                    >{currentOrderCounts[
                                        `${item.key}-${serving.key}`
                                    ] || 0}</span
                                >
                                <span role="separator">×</span>
                                <kbd>{serving.label}</kbd>
                            </button>
                        {/each}
                    </div>
                    <div class="actions">
                        <button
                            data-action="removeFromOrder"
                            class:inactive={!balanceCtrl.hasItemsInOrder(item.key)}
                            aria-label={m["baroo.bar.order.cancel"]()}
                            onclick={() =>
                                balanceCtrl.removeFromOrder(item.key)}
                            >❌</button
                        >
                    </div>
                </div>
            {/each}
        </div>
        <div class="card-footer controls">
            <button
                class="btn btn-primary"
                data-action="confirm"
                onclick={() =>
                    balanceCtrl.confirmOrder().then(() => {
                        orderDialog!.close();
                    })}>{m["baroo.bar.order.confirm"]()}</button
            >
        </div>
    </div>
</dialog>

<dialog
    id="summaryDialog"
    bind:this={summaryDialog}
    onclose={() => balanceCtrl.reset()}
>
    <button
        class="accent-warning"
        data-action="close"
        aria-label={m["baroo.bar.order.cancel"]()}
        onclick={() => summaryDialog!.close()}>✖</button
    >
    {#if balanceCtrl.workingCopy && balanceCtrl.activeMapping}
    <MemberSummary bar={store}
        items={balanceCtrl.workingCopy.items}
        activeMapping={balanceCtrl.activeMapping}
    >

    </MemberSummary>
    {:else}
    ???
    {/if}
</dialog>
{/if}

<style lang="scss">
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
}
.instr-text {
    font-size: 2rem;
}

.main-content h1 {
    @media (width <= 34rem) {
        padding-block-start: 2.5rem;
    }
}


.btn-xl {
    font-size: 3rem;
}

:global(.message-stream) {
    position: fixed;
    inset-block-end: 0.25rem;
    inset-inline-start: 0.25rem;
    width: min(30ch, 90vw);
}
</style>
