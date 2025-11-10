<script lang="ts">
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { source } from "sveltekit-sse";

    import type { PageData } from "./$types";
    import { onMount, tick } from "svelte";
    import { runBoot } from "$lib/boot";
    import type { BarOrderItem, MemberBalance } from "$lib/bar/BarModel";
    import { TagMapper } from "$lib/bar/tags";
    import { get } from "svelte/store";

    const {
        data,
    }: {
        data: PageData;
    } = $props();

    let status = $state<{ level: "✅" | "ℹ️" | "⚠️" | "❌"; text: string }>();

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
        workingCopy: null as null | (MemberBalance & { _label: string }),
        currentOrder: null as null | OrderData,

        async startOrder(id: string, label?: string) {
            const value = localStorage.getItem(`balance[${id}]`);
            /** @type {MemberBalance} */
            const balance = value
                ? JSON.parse(value)
                : {
                      id,
                      items: [],
                      _label: label || id,
                  };

            this.workingCopy = balance;
            this.currentOrder = {
                items: [],
            };

            orderDialog!.showModal();
        },

        addToOrder(item: OrderData["items"][number]) {
            if (!this.currentOrder) {
                setStatus("⚠️", "No current order");
                return;
            }
            this.currentOrder.items.push(item);
        },

        removeFromOrder(key: OrderData["items"][number]["key"]) {
            if (!this.currentOrder) {
                setStatus("⚠️", "No current order");
                return;
            }

            this.currentOrder.items = this.currentOrder.items.filter(
                (item) => item.key !== key,
            );
        },
        async confirmOrder() {
            if (!this.workingCopy) {
                setStatus("❌", "No working copy");
                return;
            }
            if (!this.currentOrder) {
                setStatus("❌", "No order");
                return;
            }
            this.workingCopy.items.push(
                ...this.currentOrder.items.map((item) => ({
                    ...item,
                    createdAt: new Date(),
                })),
            );
            localStorage.setItem(
                `balance[${this.workingCopy.id}]`,
                JSON.stringify(this.workingCopy),
            );

            this.reset();
        },

        async showSummary(id: string, label?: string) {
            const value = localStorage.getItem(`balance[${id}]`);
            balanceCtrl.workingCopy = value
                ? JSON.parse(value)
                : {
                      id,
                      items: [],
                      _label: label || id,
                  };

            summaryDialog!.showModal();
        },

        reset() {
            this.workingCopy = null;
            this.currentOrder = null;
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
            ) || { key: item.key, name: item.key, pricing: {} };

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

        return Object.values(itemCounts).map((item) => ({
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

        const member = await mapper.get(data.serialNumber as string);
        if (data.action === "summary") {
            balanceCtrl.showSummary(
                String(data.userId),
                `${member?.nickName || data.userId}`,
            );
            return;
        }
        form.reset();
        balanceCtrl.startOrder(
            String(data.userId),
            `${member?.nickName || data.userId}`,
        );
    }

    let eventStreamMessage = $state("");
    const eventStreamSource = source("/bar/scanner-event-stream", {
        close({ connect }) {
            eventStreamMessage = 'connection:closed-by-server'
            connect()
        }
    });
    const cardId = $derived.by(() => {
        if (eventStreamMessage?.startsWith('card:')) {
            return eventStreamMessage.substring('card:'.length)
        }
    })
    function copy(id: string) {
        navigator.clipboard.writeText(id)
    }
    const eventStream = eventStreamSource.select("message");

    onMount(() => {
        const booted = runBoot([
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
                                statusEl.innerText =
                                    "Cannot read data from the NFC tag.";
                            };
                            ndef.onreading = async (event) => {
                                if (balanceCtrl.workingCopy) {
                                    statusEl.innerText = `Currently processing order for ${balanceCtrl.workingCopy.id}, please finish it first.`;
                                    return;
                                }

                                const member = await mapper.get(
                                    event.serialNumber,
                                );
                                if (!member) {
                                    statusEl.innerText = `Unknown tag ${event.serialNumber}`;
                                    return;
                                }

                                try {
                                    (document.querySelector(
                                        "#serialNumber",
                                    ) as HTMLInputElement)!.value =
                                        event.serialNumber;
                                    (document.querySelector(
                                        "#userId",
                                    ) as HTMLInputElement)!.value =
                                        member.userId;
                                    document.forms
                                        .namedItem("selectBadgeForm")!
                                        .dispatchEvent(new Event("submit"));
                                    statusEl.innerText = `Tag ${event.serialNumber} recognized as ${member.nickName} (${member.userId}).`;
                                } catch (error) {
                                    statusEl.innerText = `Error processing tag ${event.serialNumber}: ${error instanceof Error ? error.message : String(error)}`;
                                }
                            };
                        })
                        .catch((error) => {
                            alert(`Error! Scan failed to start: ${error}.`);
                        });
                },
            },
        ]);

        eventStream.subscribe((message) => {
            console.log("stream message:", message);
            if (message === "heartbeat") {
                return;
            }
            eventStreamMessage = message;
        });

        return booted?.destroy;
    });
</script>

<main>
    <h1>
        {m["baroo.page_front.title"]({ barName: bar?.name || bar?.slug || "" })}
    </h1>
    <form name="selectBadgeForm" data-boot onsubmit={submitSelectForm}>
        <p class="form-status">
            <span class="level">{status?.level}</span>
            <span class="text">{status?.text}</span>
        </p>
        <div class="btn-group">
            <label class="btn">
                <input
                    type="radio"
                    name="action"
                    value="order"
                    required
                    checked
                />
                <span class="text">{m["baroo.bar.pos.action.order"]()}</span>
            </label>
            <label class="btn">
                <input type="radio" name="action" value="summary" required />
                <span class="text">{m["baroo.bar.pos.action.summary"]()}</span>
            </label>
        </div>
        <label for="userId">{m["baroo.bar.userRef"]()}</label>
        <input name="userId" id="userId" required />
        <button type="submit">{m["generic.action.open"]()}</button>

        <input type="hidden" name="serialNumber" id="serialNumber" />
    </form>

    <div class="card">
        stream: {eventStreamMessage}
        <button disabled={!cardId} onclick={() => copy(cardId || '')}>copy</button>
    </div>

    <div class="nfc-scanner" data-boot-feature="nfc" data-boot-status="idle">
        NFC: <p class="status">Idle</p>
    </div>
</main>

<dialog
    id="orderDialog"
    bind:this={orderDialog}
    onclose={() => balanceCtrl.reset()}
>
    <button
        class="accent-warning"
        data-action="close"
        aria-label="Zrušit"
        onclick={() => orderDialog!.close()}>✖</button
    >
    <div class="card">
        <h2>
            Nová objednávka - <span class="name"
                >{balanceCtrl.workingCopy?._label}</span
            >
        </h2>
        <h3>Položky</h3>
        <div class="offer">
            {#each data.offerItems as item (item.key)}
                {@const variants = Object.keys(item.pricing) as ("x" | "1")[]}
                <div class="item" data-key={item.key}>
                    <div class="actions">
                        <button
                            data-action="removeFromOrder"
                            aria-label="Pryč s tím"
                            onclick={() =>
                                balanceCtrl.removeFromOrder(item.key)}
                            >❌</button
                        >
                    </div>
                    <span>{item.name}</span>
                    {#each variants as variant (variant)}
                        <button
                            data-value={variant}
                            onclick={() =>
                                balanceCtrl.addToOrder({
                                    key: item.key,
                                    variant,
                                })}
                        >
                            <kdb>
                                <kbd>{variant}</kbd>
                                <span role="separator">×</span>
                                <span class="amount"
                                    >{currentOrderCounts[
                                        `${item.key}-${variant}`
                                    ]}</span
                                >
                            </kdb>
                        </button>
                    {/each}
                    {#each new Array(2 - variants.length) as _}
                        <span class="spacer"></span>
                    {/each}
                </div>
            {/each}
        </div>
        <div class="controls">
            <button
                class="accent-primary"
                data-action="confirm"
                onclick={() =>
                    balanceCtrl.confirmOrder().then(() => {
                        orderDialog!.close();
                    })}>Potvrdit</button
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
        aria-label="Zrušit"
        onclick={() => summaryDialog!.close()}>✖</button
    >
    <div class="card">
        <h2>
            Přehled - <span class="name">{balanceCtrl.workingCopy?._label}</span
            >
        </h2>

        <h3>Položky</h3>
        <div class="summary">
            <table>
                <thead>
                    <tr>
                        <th data-name="item">Položka</th>
                        <th data-name="amount">Množství</th>
                        <th data-name="price">Cena</th>
                    </tr>
                </thead>
                <tbody>
                    {#each summaryRows as item (item.item)}
                        <tr>
                            <td data-name="item">{item.item}</td>
                            <td data-name="amount">{item.amount}</td>
                            <td data-name="price">{item.price}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</dialog>
