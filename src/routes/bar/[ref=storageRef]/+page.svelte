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
    import type { Serving } from "$lib/bar/servings";
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
    import { SpigotStream } from "$lib/spigots/spigotStream.svelte";
    import type { SpigotAssigned, SpigotEvent, SpigotPour, SpigotServed } from "$lib/spigots/spigotEvents";
    import PourQueue, { pourServings, type PendingPour } from "./PourQueue.svelte";
    import SpigotRoster from "./SpigotRoster.svelte";

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

    /** Kept apart from the dialog layers - several customers can wait at the spigots at once */
    let pendingPours = $state<PendingPour[]>([]);
    let spigotStream = $state<SpigotStream | undefined>();

    function onSpigotEvent(event: SpigotEvent) {
        switch (event.type) {
            case "pour":
                receivePour(event);
                return;
            case "pour-served":
                serveAtSpigot(event);
                return;
            case "spigot-assigned":
                unsealAtSpigot(event);
                return;
            case "spigot-unset":
                setStatus("⚠️", m["baroo.bar.status.spigot_unset"]({ spigot: event.spigot }));
                return;
        }
    }

    /** Staff kiosks ask for the new package's size, prefilled with the previous one */
    function unsealAtSpigot(event: SpigotAssigned) {
        setStatus("ℹ️", m["baroo.bar.status.spigot_assigned"]({ spigot: event.spigot, name: event.name }));

        const stock = store.stock.find((entry) => entry.item.key === event.beverage);
        if (!store.isStaffDevice || !stock) return;

        const layer = uiLayers.pushComponent(UnsealWidget, {
            store,
            lockedItemKey: stock.item.key,
            clientId: `spigot-unseal:${event.id}`,
            initialQuantity: stock.unsealedAt && stock.unsealQuantity > 0 ? stock.unsealQuantity : undefined,
            onDone: () => layer.ctrl.close(),
        }, {
            heading: `${m["baroo.bar.stock.unseal_new"]()} — ${stock.item.name}`,
        });
    }

    function receivePour(pour: SpigotPour) {
        if (pendingPours.some((pending) => pending.id === pour.id)) return;

        const mapping = store.findMapping(pour.serialId);
        if (!mapping) {
            reportUnknown(pour.serialId);
            return;
        }

        const label = mapping.member.nickName || "???";
        greet(mapping, label);

        pendingPours = [...pendingPours, {
            id: pour.id,
            spigot: pour.spigot,
            mapping,
            label,
            beverage: pour.beverage,
        }];
    }

    async function servePour(pour: PendingPour, item: BarOfferItem, serving: Serving) {
        // Removed before the outbox write so a double press can't pour twice
        pendingPours = pendingPours.filter((pending) => pending.id !== pour.id);

        try {
            await store.process("order", {
                // Kiosks answering the same pour land one order, sync dedupes on clientId
                clientId: `spigot:${pour.id}`,
                serialId: pour.mapping.serialId,
                memberId: pour.mapping.member.id,
                memberLabel: pour.label,
                items: [{ key: item.key, variant: serving.key }],
            });
        } catch (error) {
            console.error(error);
            pendingPours = [pour, ...pendingPours];
            setStatus("❌", m["baroo.bar.status.pour_failed"]({
                name: pour.label,
                error: error instanceof Error ? error.message : String(error),
            }));
            return;
        }

        setStatus("✅", m["baroo.offline.pending"]({ count: String(store.pending.length) }));
        if (narrationEnabled) narrator?.speak(orderConfirmation());
    }

    /** Pours no longer pending were served or dismissed on the kiosk already */
    function serveAtSpigot(event: SpigotServed) {
        const pour = pendingPours.find((pending) => pending.id === event.id);
        if (!pour) return;

        const item = store.offerItems.find((candidate) => candidate.key === pour.beverage);
        const serving = item && pourServings(item).find((candidate) => candidate.key === event.variant);
        if (!item || !serving) {
            setStatus("⚠️", m["baroo.bar.status.spigot_size_unavailable"]({ spigot: event.spigot }));
            return;
        }

        void servePour(pour, item, serving);
    }

    function dismissPour(pour: PendingPour) {
        pendingPours = pendingPours.filter((pending) => pending.id !== pour.id);
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
            name: "spigots",
            // After the narrator, so the first pour already gets its greeting
            isEnabled: () => !!store.device?.spigotTicket,
            init: async () => {
                const stream = new SpigotStream({
                    barSlug: store.barSlug,
                    ticket: () => store.device?.spigotTicket ?? null,
                    onEvent: onSpigotEvent,
                });
                spigotStream = stream;

                // Not awaiting the connection, it keeps retrying in the background
                return stream.start();
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
            {#if spigotStream}
                <SpigotRoster stream={spigotStream} offerItems={store.offerItems} />
            {/if}

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
            <OfferStockBoard {store}>
                {#snippet actionsMenu(item, btnAttrs)}
                    <li>
                        <button
                            type="button"
                            {...btnAttrs}
                            onclick={() => {
                                const layer = uiLayers.pushComponent(UnsealWidget, {
                                    store,
                                    lockedItemKey: item.key,
                                    onDone: () => ( uiLayers.close(layer.id) )
                                }, {
                                    heading: `${m["baroo.bar.stock.unseal_new"]()} — ${item.name}`,
                                })
                            }}
                        >
                            {m["baroo.bar.stock.unseal_new"]()}
                        </button>
                    </li>
                {/snippet}
            </OfferStockBoard>
        {/if}
    </div>
</main>

<PourQueue
    pours={pendingPours}
    offerItems={store.offerItems}
    onServe={servePour}
    onDismiss={dismissPour}
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

:global(.stock-board) {
    margin-block-start: 2rem;

    width: min(72rem, calc(100vw - 2rem));
    position: relative;
    left: 50%;
    transform: translateX(-50%);
}
</style>
