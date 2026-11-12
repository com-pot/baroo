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
    import { TAP_STALE_MS } from "$lib/taps/tapEvents";
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
            taps: tapStream?.connected
                ? tapStream.taps
                : store.taps.map((assignment) => ({ tap: assignment.tap, offerItemKey: assignment.offerItemKey })),
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

    let tapStream = $state<TapStream | undefined>();

    /** The bar's taps, with what is on them - live from the server, or from this device's data */
    const knownTaps = $derived([
        ...(tapStream?.taps ?? []).map((state) => ({ tap: state.tap, offerItemKey: state.offerItemKey })),
        ...store.taps.map((assignment) => ({ tap: assignment.tap, offerItemKey: assignment.offerItemKey })),
        ...(store.snapshot?.taps ?? []).map((tap) => ({ tap: String(tap.sequence), offerItemKey: null })),
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

    async function flushPackage(
        item: BarOfferItem,
        packageId: string,
        left: { measure: Measure, quantity: number | null },
        tap?: string | null,
    ) {
        const confirmed = confirm(m["baroo.bar.stock.flush_confirm"]({
            name: item.name,
            left: left.quantity === null ? "?" : formatQuantity(left.measure, left.quantity),
        }));
        if (!confirmed) return;

        try {
            await store.process("flush", {
                packageId,
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
            isEnabled: () => !!store.device?.token && !!store.snapshot?.taps?.length,
            init: async () => {
                const stream = new TapStream({
                    barSlug: store.barSlug,
                    token: () => store.device?.token ?? null,
                });
                tapStream = stream;

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
                    {#if entry.package}
                        {@const offerPackage = entry.package}
                        <li>
                            <button
                                type="button"
                                {...btnAttrs}
                                onclick={() => flushPackage(entry.item, offerPackage.id, { measure: entry.measure, quantity: entry.left }, offerPackage.tap)}
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
    {@const packageId = tap.stock?.packageId ?? store.taps.find((assignment) => assignment.tap === tap.tap)?.packageId}
    <li>
        <button
            type="button"
            {...btnAttrs}
            onclick={() => openUnseal({ tap: tap.tap })}
        >
            {m["baroo.bar.tap.unseal_onto"]()}
        </button>
    </li>
    {#if item && packageId}
        <li>
            <button
                type="button"
                {...btnAttrs}
                onclick={() => flushPackage(item, packageId, {
                    measure: item.measure,
                    quantity: tap.stock?.left ?? null,
                }, tap.tap)}
            >
                {m["baroo.bar.stock.flush"]()}
            </button>
        </li>
    {/if}
{/snippet}

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
