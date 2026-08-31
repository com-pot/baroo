<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { browser } from "$app/environment";

    import type { PageData } from "./$types";
    import { onMount } from "svelte";
    import { Boot } from "$lib/boot";
    import { greetingFor } from "$lib/pos/device";
    import { normalizeTag, type TagMapping } from "$lib/bar/tags";
    import { computeTotalPrice } from "$lib/bar/stats/memberSummaries";
    import { servingLabel, servingsOf } from "$lib/bar/servings";
    import { Narrator } from "$lib/speech.svelte";
    import { ScannerEventStream } from "./scannerEventStream.svelte";
    import MessageStream from "./MessageStream.svelte";
    import Gzt from "./Gzt.svelte";

    const {
        data,
    }: {
        data: PageData;
    } = $props();

    const store = $derived(data.bar);

    let debug = $state('')

    let status = $state<{ level: "✅" | "ℹ️" | "⚠️" | "❌"; text: string }>();
    let mode = $state<"order" | "summary">("order");
    let userIdInput = $state("");

    let bar = $derived(store.snapshot?.bar ?? null);
    let offerItems = $derived(store.offerItems);
    let narrationEnabled = $derived(!!store.config.greetingTemplate.trim());

    let orderDialog = $state<HTMLDialogElement>();
    let summaryDialog = $state<HTMLDialogElement>();

    type OrderItem = { key: string; variant: string };

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
                memberId: this.activeMapping?.userId,
                memberLabel: this.workingCopy.label,
                items: [...this.currentOrder.items],
            });

            setStatus("✅", m["baroo.offline.pending"]({ count: String(store.pending.length) }));
            this.reset();
        },

        /** Summary is the unsettled tab, computed from snapshot + outbox. */
        showSummary(mapping: TagMapping, label: string) {
            this.activeMapping = mapping;

            const timeline = store.timeline(mapping.userId);
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

    const summaryRows = $derived.by(() => {
        const itemCounts: Record<
            string,
            {
                name: string;
                valueCounts: Record<
                    string,
                    { value: string; price: number; count: number }
                >;
            }
        > = {};

        for (const item of balanceCtrl.workingCopy?.items || []) {
            const offerItem = offerItems.find((o) => o.key === item.key);
            if (!offerItem) {
                console.warn("Unknown offer item in balance:", item);
                continue
            }

            if (!itemCounts[item.key]) {
                itemCounts[item.key] = { name: offerItem.name, valueCounts: {} };
            }
            if (!itemCounts[item.key].valueCounts[item.variant]) {
                itemCounts[item.key].valueCounts[item.variant] = {
                    value: servingLabel(offerItem, item.variant),
                    price: offerItem.pricing?.[item.variant] || 0,
                    count: 0,
                };
            }
            itemCounts[item.key].valueCounts[item.variant].count++;
        }

        return Object.values(itemCounts)
                .map((item) => ({
                    item: item.name,
                    amount: Object.values(item.valueCounts)
                        .map(
                            (data) =>
                                `${data.count}×${data.value}` +
                                (data.price ? ` (${data.price} Kč)` : ""),
                        )
                        .join(", "),
                    price: Object.values(item.valueCounts).reduce(
                        (sum, vc) => sum + vc.count * vc.price,
                        0,
                    ),
                }));
    });

    const summaryTotalPrice = $derived(
        computeTotalPrice(balanceCtrl.workingCopy?.items || [], store.barOffer),
    );

    const priceFormatter = new Intl.NumberFormat('cs', {
        style: 'currency',
        currency: "czk",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })

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
        return (
            store.findMappingByMember(member.id) ?? {
                serialId: "",
                userId: member.id,
                nickName: member.nickName,
                extra: {
                    avatar_1x1: member.avatar_1x1 ?? "",
                    greeting: member.greeting,
                },
            }
        );
    }

    function submitSelectForm(e: SubmitEvent) {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = Object.fromEntries(new FormData(form).entries());

        const raw = String(formData.serialId || "");
        const serialId = normalizeTag(raw);
        const mapping = resolveEntry(raw);

        if (!mapping) {
            if (narrationEnabled) narrator?.speak("Cožeto? Neznám!")

            // A mistyped badge number is not a card — putting it on the staff console's
            // to-do list would only give them a phantom to chase.
            if (BADGE_NUMBER.test(serialId)) {
                setStatus("⚠️", m["baroo.bar.status.unknown_member_seq"]({ seq: serialId }));
                return;
            }

            store.noteUnknownTag(serialId);
            setStatus("⚠️", m["baroo.bar.status.unknown_tag"]({ serialId }));
            return;
        }

        const displayName = mapping.nickName || "???";

        // `null` when this device has no greeting template — narration is off entirely.
        const greeting = greetingFor(store.config, {
            nickName: displayName,
            greeting: typeof mapping.extra?.greeting === "string" ? mapping.extra.greeting : undefined,
        });
        if (greeting) narrator?.speak(greeting);

        if (formData.action === "summary") {
            balanceCtrl.showSummary(mapping, displayName);
            return;
        }

        balanceCtrl.startOrder(mapping, displayName);
    }

    function submitTagId(serialId: string, statusEl?: HTMLElement | null) {
        const serial = normalizeTag(serialId);
        const member = store.findMapping(serial);
        if (!statusEl) statusEl = document.getElementById('submitStatus')

        console.debug('submitTagId', { serialId, serial, member })
        if (!member) {
            store.noteUnknownTag(serial);
            if (statusEl) {
                statusEl.innerText = m["baroo.bar.status.unknown_tag"]({ serialId });
            }
            return;
        }

        try {
            (document.querySelector("#serialId") as HTMLInputElement)!.value = serial;
            document.forms
                .namedItem("selectBadgeForm")!
                .dispatchEvent(new Event("submit"));
            if (statusEl) {
                statusEl.innerText = m["baroo.bar.status.tag_recognized"]({
                    serialId: serial,
                    nickName: member.nickName,
                    userId: member.userId
                })
            }
        } catch (error) {
            console.error(error)
            if (statusEl) {
                statusEl.innerText = m["baroo.bar.status.error_processing"]({
                    serialId: serial,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * The PC/SC reader lives on a server, which the venue does not have. Kept for bars
     * that do run one — but it must never hold up boot, so it is not a boot feature.
     */
    const scannerEventStream = new ScannerEventStream(data.ref, {
        historySize: 5,
        onMessage(message) {
            if (message.startsWith('card:')) {
                submitTagId(normalizeTag(message.substring('card:'.length)))
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
            init: async (featureEl) => {
                if (!featureEl) featureEl = document.createElement("div");

                const statusEl: HTMLElement =
                    featureEl.querySelector(".status") ||
                    (() => {
                        const p = document.createElement("p");
                        p.classList.add("status");
                        featureEl.appendChild(p);
                        return p;
                    })();

                const ndef = new NDEFReader();
                await ndef.scan();

                ndef.onreadingerror = () => {
                    statusEl.innerText = "Cannot read data from the NFC tag.";
                };
                ndef.onreading = (event) => {
                    if (balanceCtrl.workingCopy) {
                        statusEl.innerText = m["baroo.bar.status.processing"]({ userId: balanceCtrl.workingCopy.id });
                        return;
                    }
                    submitTagId(event.serialNumber)
                };
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
</script>

<main class="boot-stack" data-theme={store.config.theme}>
    <div class="page-header">
        <h1>
            {m["baroo.page_front.title"]({ barName: bar?.name || bar?.slug || "" })}
        </h1>
        {#if store.deviceLabel}
            <p class="device-name">{store.deviceLabel}</p>
        {/if}
    </div>
    <div data-boot-init>
        <button class="btn btn-xl btn-primary" onclick={() => boot.run()}>Tak to rozjedem</button>
    </div>

    <div class="main-content">
        <form name="selectBadgeForm" class="card card-body" data-boot onsubmit={submitSelectForm}>
            <div class="form-section">
                <div class="btn-group">
                    <label class="btn btn-baroo">
                        <input
                            type="radio"
                            name="action"
                            value="order"
                            required
                            checked={mode === "order"}
                            onchange={() => mode = 'order'}
                        />
                        <span class="text">{m["baroo.bar.pos.action.order"]()}</span>
                    </label>
                    <label class="btn btn-baroo">
                        <input type="radio" name="action" value="summary" required
                        checked={mode === "summary"}
                        onchange={() => mode = 'summary'}
                    />
                        <span class="text">{m["baroo.bar.pos.action.summary"]()}</span>
                    </label>
                </div>
            </div>

            {#if store.config.idInput}
            <div class="form-section">
                <div class="input-group input-group-lg">
                    <input
                        name="serialId"
                        id="serialId"
                        class="form-control"
                        required
                        aria-label={m["baroo.bar.userRef"]()}
                        bind:value={userIdInput}
                        placeholder={m["baroo.bar.pos.id_input_placeholder"]()}
                    />
                    <button type="submit" class="btn btn-primary" aria-label={m["generic.action.open"]()}>⏎</button>
                </div>
            </div>
            {:else}
            <input type="hidden" name="serialId" id="serialId" />
            {/if}
            <p id="submitStatus"></p>
        </form>

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
                    ? `/storage/api/files/bar_members/${balanceCtrl.activeMapping.userId}/${balanceCtrl.activeMapping.extra.avatar_1x1}`
                    : '/assets/default-badge.svg'
                }
                alt=""
            />
            <h2>
                {m["baroo.bar.order.title_new"]({ userName: balanceCtrl.workingCopy?.label || "" })}
            </h2>
        </div>
        <div class="card-body offer">
            {#each offerItems as item (item.key)}
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
    <div class="card">
        <div class="card-header">
            <img
                class="avatar-1x1"
                src={balanceCtrl.activeMapping?.extra?.avatar_1x1
                    ? `/storage/api/files/bar_members/${balanceCtrl.activeMapping.userId}/${balanceCtrl.activeMapping.extra.avatar_1x1}`
                    : '/assets/default-badge.svg'
                }
                alt=""
            />
            <h2>
                {m["baroo.bar.order.title_summary"]({ userName: balanceCtrl.workingCopy?.label || "" })}
            </h2>
        </div>
        <div class="summary">
            <table>
                <thead>
                    <tr>
                        <th data-name="item">{m["baroo.bar.summary.item"]()}</th>
                        <th data-name="amount">{m["baroo.bar.summary.amount"]()}</th>
                        <th data-name="price">{m["baroo.bar.summary.price"]()}</th>
                    </tr>
                </thead>
                <tbody>
                    {#each summaryRows as item, i (i)}
                        <tr>
                            <td data-name="item">{item.item}</td>
                            <td data-name="amount">{item.amount}</td>
                            <td data-name="price">{priceFormatter.format(item.price)}</td>
                        </tr>
                    {/each}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2"></td>
                        <td data-name="price">{priceFormatter.format(summaryTotalPrice)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>
</dialog>
{/if}

<style lang="scss">
.boot-stack {
    display: grid;
    > * {
        grid-area: 1 / 1;
    }

    [data-boot-init] {
        z-index: 20;
    }
}
.instr-text {
    font-size: 2rem;
}


.btn-xl {
    font-size: 4rem;
    width: 100%;
    height: 10ch;
}

:global(.message-stream) {
    position: fixed;
    inset-block-end: 0.25rem;
    inset-inline-start: 0.25rem;
    width: min(30ch, 90vw);
}
</style>
