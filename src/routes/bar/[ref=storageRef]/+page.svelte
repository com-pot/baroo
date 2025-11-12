<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { source } from "sveltekit-sse";
    import { browser } from "$app/environment";

    import type { PageData } from "./$types";
    import { onMount } from "svelte";
    import { runBoot } from "$lib/boot";
    import type { BarOrderItem, MemberBalance } from "$lib/bar/BarModel";
    import { TagMapper } from "$lib/bar/tags";

    const {
        data,
    }: {
        data: PageData;
    } = $props();

    let status = $state<{ level: "✅" | "ℹ️" | "⚠️" | "❌"; text: string }>();
    let mode = $state<"order" | "summary">("order");
    let userIdInput = $state("");

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
                createdAt: new Date(),
            }));

            this.workingCopy.items.push(...newItems);

            // Save to localStorage
            localStorage.setItem(
                `balance[${this.workingCopy.id}]`,
                JSON.stringify(this.workingCopy),
            );

            // Save to database if not local
            if (data.ref.type !== 'local') {
                try {
                    const formData = new FormData();
                    formData.append('userId', this.workingCopy.id);
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

        async showSummary(id: string, label?: string) {
            const value = localStorage.getItem(`balance[${id}]`);
            const balance = value
                ? JSON.parse(value)
                : {
                      id,
                      items: [],
                      _label: label || id,
                  };

            // Always update the label with the current nickname
            balance._label = label || id;
            balanceCtrl.workingCopy = balance;

            summaryDialog!.showModal();
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

        // Try to get member from serialNumber first (NFC scan), then from userId (manual entry)
        let member = await mapper.get(data.serialNumber as string);
        if (!member && data.userId) {
            member = mapper.mappings
                .find((m) => m.userId === String(data.userId));
        }

        // Block action if user is not mapped
        if (!member && data.userId) {
            setStatus("⚠️", m["baroo.bar.status.user_not_mapped"]({ userId: String(data.userId) }));
            return; // Don't proceed with opening order/summary
        }

        const displayName = member?.nickName || String(data.userId);

        if (data.action === "summary") {
            balanceCtrl.showSummary(String(data.userId), displayName);
            return;
        }

        balanceCtrl.startOrder(String(data.userId), displayName);
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
                                    statusEl.innerText = m["baroo.bar.status.processing"]({ userId: balanceCtrl.workingCopy.id });
                                    return;
                                }

                                const member = await mapper.get(
                                    event.serialNumber,
                                );
                                if (!member) {
                                    statusEl.innerText = m["baroo.bar.status.unknown_tag"]({ serialNumber: event.serialNumber });
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
                                    statusEl.innerText = m["baroo.bar.status.tag_recognized"]({
                                        serialNumber: event.serialNumber,
                                        nickName: member.nickName,
                                        userId: member.userId
                                    });
                                } catch (error) {
                                    statusEl.innerText = m["baroo.bar.status.error_processing"]({
                                        serialNumber: event.serialNumber,
                                        error: error instanceof Error ? error.message : String(error)
                                    });
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
    <div class="page-header">
        <h1>
            {m["baroo.page_front.title"]({ barName: bar?.name || bar?.slug || "" })}
        </h1>
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

            <div class="form-section">
                <div class="input-group input-group-lg">
                    <input
                        name="userId"
                        id="userId"
                        class="form-control"
                        required
                        aria-label={m["baroo.bar.userRef"]()}
                        bind:value={userIdInput}
                        placeholder="Zadejte ID..."
                    />
                    <button type="submit" class="btn btn-primary" aria-label={m["generic.action.open"]()}>⏎</button>
                </div>
            </div>

            <input type="hidden" name="serialNumber" id="serialNumber" />
        </form>

        <div class="info-sections">
            {#if status?.text}
                <div class="form-status" data-level={status.level}>
                    <span class="level">{status.level}</span>
                    <span class="text">{status.text}</span>
                </div>
            {/if}
            <div class="card info-card">
                <div class="card-header">
                    <span class="icon">📡</span>
                    <span class="title">{m["baroo.bar.stream"]()}</span>
                </div>
                <div class="card-body">
                    <span class="message">{eventStreamMessage || '—'}</span>
                    {#if cardId}
                        <button class="copy-btn" onclick={() => copy(cardId || '')}>
                            {m["generic.action.copy"]()}
                        </button>
                    {/if}
                </div>
            </div>

            <div class="info-card nfc-scanner" data-boot-feature="nfc" data-boot-status="idle">
                <div class="info-header">
                    <span class="icon">📱</span>
                    <span class="title">{m["baroo.bar.nfc"]()}</span>
                </div>
                <div class="info-content">
                    <p class="status">{m["baroo.bar.status.idle"]()}</p>
                </div>
            </div>
        </div>
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
        <h2>
            {m["baroo.bar.order.title_new"]({ userName: balanceCtrl.workingCopy?._label || "" })}
        </h2>
        <h3>{m["baroo.bar.order.items"]()}</h3>
        <div class="offer">
            {#each data.offerItems as item (item.key)}
                {@const variants = Object.keys(item.pricing) as ("x" | "1")[]}
                <div class="item" data-key={item.key}>
                    <div class="actions">
                        <button
                            data-action="removeFromOrder"
                            aria-label={m["baroo.bar.order.cancel"]()}
                            onclick={() =>
                                balanceCtrl.removeFromOrder(item.key)}
                            >❌</button
                        >
                    </div>
                    <span>{item.name}</span>
                    {#each variants as variant (variant)}
                        {@const displayLabel = item.variantLabels?.[variant] || variant}
                        <button
                            data-value={variant}
                            onclick={() =>
                                balanceCtrl.addToOrder({
                                    key: item.key,
                                    variant,
                                })}
                        >
                            <kbd>{displayLabel}</kbd>
                            <span role="separator">×</span>
                            <span class="amount"
                                >{currentOrderCounts[
                                    `${item.key}-${variant}`
                                ] || 0}</span
                            >
                        </button>
                    {/each}
                    {#each new Array(Math.max(0, 2 - variants.length)) as _}
                        <span class="spacer"></span>
                    {/each}
                </div>
            {/each}
        </div>
        <div class="controls">
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
        <h2>
            {m["baroo.bar.order.title_summary"]({ userName: balanceCtrl.workingCopy?._label || "" })}
        </h2>

        <h3>{m["baroo.bar.order.items"]()}</h3>
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
{/if}
