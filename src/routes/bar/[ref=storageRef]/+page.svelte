<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { browser } from "$app/environment";

    import type { PageData } from "./$types";
    import { onMount } from "svelte";
    import { Boot, runBoot } from "$lib/boot";
    import type { BarMember, BarOrderItem, MemberBalance } from "$lib/bar/BarModel";
    import { normalizeTag, TagMapper, type TagMapping } from "$lib/bar/tags";
    import { stringifyStorageRef } from "$lib/bar/refs";
    import { StreakCounter, CpsCounter, DecayCounter, BrainrotSoundPad, TotalCounter } from "./eggs.svelte";
    import { Narrator } from "$lib/speech.svelte";
    import { ScannerEventStream } from "./scannerEventStream.svelte";
    import MessageStream from "./MessageStream.svelte";
    import Gzt from "./Gzt.svelte";

    const {
        data,
    }: {
        data: PageData;
    } = $props();
    let debug = $state('')

    let status = $state<{ level: "✅" | "ℹ️" | "⚠️" | "❌"; text: string }>();
    let mode = $state<"order" | "summary">("order");
    let userIdInput = $state("");
    let isLoadingSummary = $state(false);

    let bar = $derived.by(() => {
        if (data.bar) {
            return data.bar;
        }
        if (data.ref.type === "local") {
            return { slug: data.ref.key, name: "Local Bar " + data.ref.key };
        }
        return null;
    });

    let orderDialog = $state<HTMLDialogElement>();
    let summaryDialog = $state<HTMLDialogElement>();

    const mapper = new TagMapper(data.ref);
    interface OrderData {
        items: Pick<BarOrderItem, "key" | "variant">[];
    }
    const balanceCtrl = $state({
        activeMapping: null as null | TagMapping,
        workingCopy: null as null | (MemberBalance & { _label: string }),
        currentOrder: null as null | OrderData,

        async startOrder(id: string, label?: string) {
            const value = null //localStorage.getItem(`balance[${id}]`);
            /** @type {MemberBalance} */
            const balance = value
                ? JSON.parse(value)
                : {
                      id,
                      items: [],
                      _label: label || id,
                  };

            // Always update the label with the current nickname
            balance._label = label || id;

            this.workingCopy = balance;
            this.currentOrder = {
                items: [],
            };

            orderDialog!.showModal();
        },

        addToOrder(item: OrderData["items"][number]) {
            if (!this.currentOrder) {
                setStatus("⚠️", m["baroo.bar.status.no_order"]());
                return;
            }
            this.currentOrder.items.push(item);
        },

        removeFromOrder(key: OrderData["items"][number]["key"]) {
            if (!this.currentOrder) {
                setStatus("⚠️", m["baroo.bar.status.no_order"]());
                return;
            }            this.currentOrder.items = this.currentOrder.items.filter(
                (item) => item.key !== key,
            );
        },

        hasItemsInOrder(key: OrderData['items'][number]['key']): boolean {
            const items = this.currentOrder?.items || []
            return items.some((item) => item.key === key)
        },
        async confirmOrder() {
            if (!this.workingCopy) {
                setStatus("❌", m["baroo.bar.status.no_working_copy"]());
                return;
            }
            if (!this.currentOrder) {
                setStatus("❌", m["baroo.bar.status.no_order"]());
                return;
            }

            const newItems = this.currentOrder.items.map((item) => ({
                ...item,
                created: new Date(),
            }));

            this.workingCopy.items.push(...newItems);

            // Save to localStorage
            // localStorage.setItem(
            //     `balance[${this.workingCopy.id}]`,
            //     JSON.stringify(this.workingCopy),
            // );

            // Save to database if not local
            if (data.ref.type !== 'local') {
                try {
                    const formData = new FormData();
                    formData.append('serialId', this.workingCopy.id);
                    formData.append('items', JSON.stringify(this.currentOrder.items));

                    const response = await fetch('?/createOrder', {
                        method: 'POST',
                        body: formData,
                    });

                    const result = await response.json();

                    if (result.type === 'success') {
                        setStatus("✅", "Objednávka úspěšně uložena");
                    } else {
                        console.error('Failed to save order:', result);
                        setStatus("⚠️", "Objednávka uložena lokálně, ale nepodařilo se uložit do databáze");
                    }
                } catch (error) {
                    console.error('Error saving order:', error);
                    setStatus("⚠️", "Objednávka uložena lokálně, ale nepodařilo se uložit do databáze");
                }
            }

            this.reset();
        },

        async showSummary(entry: TagMapping, label?: string) {
            console.log('showSummary', entry)
            isLoadingSummary = true;
            try {
                let balance;

                if (data.ref.type === 'local') {
                    const value = localStorage.getItem(`balance[${entry.userId}]`) || 'null';
                    balance = JSON.parse(value);
                } else if (data.ref.type === 'db') {
                    try {
                        const response = await fetch(`/api/bars/${data.ref.key}/member/${entry.userId}/timeline`);
                        if (!response.ok) {
                            setStatus("❌", "Nepodařilo se načíst data ze serveru");
                            return
                        }

                        const timeline = await response.json();
                        const orderItems = timeline
                            .filter((entry: any) => entry.type === 'order')
                            .map((entry: any) => ({
                                key: entry.data.key,
                                variant: entry.data.variant,
                                createdAt: new Date(entry.date),
                            }));

                        balance = {
                            id: entry.userId,
                            items: orderItems,
                            _label: label || entry.userId,
                        };
                    } catch (error) {
                        console.error('Failed to fetch member timeline:', error);
                        setStatus("⚠️", "Nepodařilo se načíst data ze serveru");
                    }
                }

                if (!balance) {
                    balance = {
                        id: entry.userId,
                        items: [],
                        _label: label || entry.userId,
                    };
                }

                // Always update the label with the current nickname
                balance._label = label || entry.userId;
                balanceCtrl.workingCopy = balance;

                summaryDialog!.showModal();
            } finally {
                isLoadingSummary = false;
            }
        },

        reset() {
            this.workingCopy = null;
            this.currentOrder = null;
            userIdInput = "";
            mode = "order"
        },
    });
    const currentOrderCounts = $derived.by(() => {
        /** @type {Record<string, number>} */
        const counts: Record<string, number> = {};
        if (balanceCtrl.currentOrder) {
            for (const item of balanceCtrl.currentOrder.items) {
                const key = `${item.key}-${item.variant}`;
                counts[key] = (counts[key] || 0) + 1;
            }
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
            const offerItem = data.offerItems.find(
                (o) => o.key === item.key,
            );
            if (!offerItem) {
                console.warn("Unknown offer item in balance:", item);
                continue
            }

            if (!itemCounts[item.key]) {
                itemCounts[item.key] = {
                    name: offerItem?.name || item.key,
                    valueCounts: {},
                };
            }
            if (!itemCounts[item.key].valueCounts[item.variant]) {
                itemCounts[item.key].valueCounts[item.variant] = {
                    value: item.variant,
                    price: offerItem.pricing?.[item.variant] || 0,
                    count: 0,
                };
            }
            itemCounts[item.key].valueCounts[item.variant].count++;
        }


        return Object.values(itemCounts)
                .map((item) => ({
                    item: item.name,
                    amount: Object.entries(item.valueCounts)
                        .map(
                            ([value, data]) =>
                                `${data.count}×${value}` +
                                (data.price ? ` (${data.price} Kč)` : ""),
                        )
                        .join(", "),
                    price: Object.values(item.valueCounts).reduce(
                        (sum, vc) => sum + vc.count * vc.price,
                        0,
                    ),
                }));
    });
    const summaryTotalPrice = $derived.by(() => {
        let total = 0
        for (let row of summaryRows) {
            total += row.price
        }
        return total
    })
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

    async function submitSelectForm(e: SubmitEvent) {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const data = Object.fromEntries(new FormData(form).entries());

        const mapping = balanceCtrl.activeMapping = await mapper.get(data.serialId as string) || null;
        if (!mapping) {
            narrator.speak("Cožeto? Neznám!")
            setStatus("⚠️", m["baroo.bar.status.user_not_mapped"]({ userId: String(data.userId) }));
            return;
        }

        let displayName = mapping.nickName || "???";
        const greeting = mapping.extra?.greeting

        if (typeof greeting === "string" && greeting) {
            narrator.speak(greeting);
        } else {
            narrator.speak(`Ave ${displayName}`);
        }

        if (data.action === "summary") {
            balanceCtrl.showSummary(mapping, displayName);
            return;
        }

        balanceCtrl.startOrder(String(data.serialId), displayName);
    }

    const scannerEventStream = new ScannerEventStream(stringifyStorageRef(data.ref), {
        historySize: 5,
        onMessage(message) {
            if (message.startsWith('card:')) {
                const cardId = normalizeTag(message.substring('card:'.length))
                submitTagId(cardId)
                return
            }
        },
    })

    const cardId = $derived.by(() => {
        if (scannerEventStream.lastMessage?.startsWith('card:')) {
            return scannerEventStream.lastMessage.substring('card:'.length)
        }
    })


    async function submitTagId(serialId: string, statusEl?: HTMLElement | null) {
        const serial = normalizeTag(serialId);
        const member = await mapper.get(serial);
        if (!statusEl) statusEl = document.getElementById('submitStatus')

        console.debug('submitTagId', { serialId, serial, member })
        if (!member) {
            if (statusEl) {
                statusEl.innerText = m["baroo.bar.status.unknown_tag"]({ serialId: serialId });
            }
            return;
        }

        try {
            (document.querySelector(
                "#serialId",
            ) as HTMLInputElement)!.value =
                serial;
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
            if(statusEl) {
                statusEl.innerText = m["baroo.bar.status.error_processing"]({
                    serialId: serial,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    let narrator: Narrator
    const boot = new Boot([
        {
            name: "tag-mapper",
            init: () => mapper.load(),
        },
        {
            name: "nfc",
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
                ndef.scan()
                    .then(() => {
                        ndef.onreadingerror = () => {
                            statusEl.innerText = "Cannot read data from the NFC tag.";
                        };
                        ndef.onreading = async (event) =>{
                            if (balanceCtrl.workingCopy) {
                                statusEl.innerText = m["baroo.bar.status.processing"]({ userId: balanceCtrl.workingCopy.id });
                                return;
                            }
                            submitTagId(event.serialNumber)
                        };
                    })
                    .catch((error) => {
                        alert(`Error! Scan failed to start: ${error}.`);
                    });
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
                globalThis.speak = (text: string) => {
                    const result = narrator.speak(text)
                    console.log(result)
                }
                console.debug("Narrator initialized as the speak(\"\") function")
                return narrator
            },
        },
    ])

    // const soundpad = new BrainrotSoundPad('🫧', [
    //     { src: "/assets/eggs/lizard-button-sound.mp3" },
    //     { src: "/assets/eggs/pop/bubble-pop-04-323580.mp3" },
    //     { src: "/assets/eggs/pop/bubble-pop-06-351337.mp3" },
    //     { src: "/assets/eggs/pop/bubble-pop-07-351339.mp3" },
    //     { src: "/assets/eggs/pop/pop-402323.mp3" },
    // ])
    const soundpad = new BrainrotSoundPad('🫧', [
        { src: "/assets/eggs/pop/bubble-pop-02-293341.mp3" },
        { src: "/assets/eggs/pop/bubble-pop-04-323580.mp3" },
        { src: "/assets/eggs/pop/bubble-pop-06-351337.mp3" },
        { src: "/assets/eggs/pop/bubble-pop-07-351339.mp3" },
        { src: "/assets/eggs/pop/pop-402323.mp3" },
    ])

    const shutUpDecay = new DecayCounter()
    const totalCounter = new TotalCounter({
        get: () => fetch("/api/counters/lizard").then((res) => res.json()).then(data => data.count),
        set: (value) => {
            return fetch("/api/counters/lizard", {
                method: "PUT",
                headers: { "Content-Type": "application/json", },
                body: JSON.stringify({ delta: value }),
            })
                .then((res) => res.json())
                .then((data) => data.count)
        },
    })
    const streak = new StreakCounter({
        onExpire(num) {
            totalCounter.trigger(num)
            if (debug.includes('noCounter')) {
                return
            }
            totalCounter.commit()
        }
    })
    const cps = new CpsCounter({
        windowSizeMs: 250,
        totalTime: 5_000,
    })
    onMount(() => cps.activate())

    onMount(() => {
        scannerEventStream.init()

        const url = new URL(window.location.toString())
        debug = url.searchParams.get('debug') || ''

        totalCounter.load()

        return () => {
            boot.destroy()
        };
    });
</script>

<main class="boot-stack">
    <div class="page-header">
        <h1>
            {m["baroo.page_front.title"]({ barName: bar?.name || bar?.slug || "" })}
        </h1>
    </div>
    <div data-boot-init>
        <button class="btn btn-xl btn-primary" onclick={() => boot.run()}>Tak to rozjedem</button>
    </div>

    <div class="main-content">
        <form name="selectBadgeForm" class="card card-body" data-boot onsubmit={submitSelectForm}>
            <p class="instr-text">Vyber akci</p>
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

            {#if isLoadingSummary}
                <div class="progress mt-2" style="height: 12px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
                </div>
            {/if}

            {#if debug?.includes('input')}
            <p>a zadej NFC serial id</p>

            <div class="form-section">
                <div class="input-group input-group-lg">
                    <input
                        name="serialId"
                        id="serialId"
                        class="form-control"
                        required
                        aria-label={m["baroo.bar.userRef"]()}
                        bind:value={userIdInput}
                        placeholder="Zadejte ID..."
                    />
                    <button type="submit" class="btn btn-primary" aria-label={m["generic.action.open"]()}>⏎</button>
                </div>
            </div>
            {:else}
            <p class="instr-text">a přilož svojí visačku na zadní stranu tabletu, viz obrázek ➡️</p>

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

            <Gzt
                sound={soundpad}
                shutUp={shutUpDecay}
                total={totalCounter}
                streak={streak}
                cps={cps}
            />
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
                {m["baroo.bar.order.title_new"]({ userName: balanceCtrl.workingCopy?._label || "" })}
            </h2>
        </div>
        <div class="card-body offer">
            {#each data.offerItems as item (item.key)}
                {@const variants = Object.keys(item.pricing)}
                <div class="item" data-key={item.key}>
                    <span class="item-name">{item.name}</span>
                    {#if item.preview_1x1}
                        <div class="frame preview" title={JSON.stringify(item)}>
                            <img src={`/storage/api/files/bar_offer_items/${item.id}/${item.preview_1x1}`} alt="" />
                        </div>
                    {/if}
                    <div class="variants">
                        {#each variants as variant (variant)}
                            {@const displayLabel = item.variantLabels?.[variant] || variant}
                            <button
                                data-value={variant}
                                onclick={() => balanceCtrl.addToOrder({ key: item.key, variant })}
                            >
                                <span class="amount"
                                    >{currentOrderCounts[
                                        `${item.key}-${variant}`
                                    ] || 0}</span
                                >
                                <span role="separator">×</span>
                                <kbd>{displayLabel}</kbd>
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
                {m["baroo.bar.order.title_summary"]({ userName: balanceCtrl.workingCopy?._label || "" })}
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
{#each soundpad.files as file (file.src)}
    <audio src={file.src} preload="auto"></audio>
{/each}
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
