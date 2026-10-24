<script lang="ts">
    import "bootstrap/scss/bootstrap.scss";
    import "$lib/assets/bar.scss";
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { browser } from "$app/environment";
    import { page } from "$app/state";

    import type { PageData } from "./$types";
    import { onMount } from "svelte";
    import { Boot } from "$lib/boot";
    import { greetingFor, orderConfirmation } from "$lib/pos/device";
    import { listenForKeyboardWedge } from "$lib/pos/keyboardWedge";
    import { normalizeTag, type TagMapping } from "$lib/bar/tags";
    import { Narrator } from "$lib/speech.svelte";
    import OfferStockBoard from "./OfferStockBoard.svelte";
    import Gzt from "$lib/eggs/Gzt.svelte";
    import WallClock from "./WallClock.svelte";
    import type { BarOrderItem } from "$lib/bar/BarModel";
    import MemberSummary from "./MemberSummaryDialogContent.svelte";
    import { getUiLayers, type UiLayer } from "$lib/ui/uiLayers.svelte";
    import StaffDrawer from "./StaffDrawer.svelte";
    import NewOrderDialogContent from "./NewOrderDialogContent.svelte";

    const layerManager = getUiLayers()

    const {
        data,
    }: {
        data: PageData;
    } = $props();

    const store = $derived(data.bar);
    const debug = $derived(page.url.searchParams.get('debug') || '')

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

    function startOrder(mapping: TagMapping, onDestroyed: () => unknown) {
        const layer = layerManager.pushComponent(NewOrderDialogContent, {
            store,
            activeMapping: mapping,
            items: [],
            onOrderDone() {
                // TODO: Add visual feedback for order confirmation
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

        return layerManager.pushComponent(MemberSummary, {
            store,
            items,
            activeMapping: mapping,
        }, {
            scope: "dialog",
            onDestroyed,
        })
    }

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
            setStatus("ℹ️", m["baroo.bar.status.processing"]({ userId: currentDialog.id }));
            return;
        }

        const mapping = store.findMapping(normalizeTag(raw), store.config.idInput.includes("member"));

        if (!mapping) {
            if (narrationEnabled) narrator?.speak("Cožeto? Neznám!")

            if (BADGE_NUMBER.test(raw)) {
                setStatus("⚠️", m["baroo.bar.status.unknown_member_seq"]({ seq: raw }));
                return;
            }

            store.noteUnknownTag(raw);
            setStatus("⚠️", m["baroo.bar.status.unknown_tag"]({ serialId: raw }));
            return;
        }

        const displayName = mapping.member.nickName || "???";
        const greeting = greetingFor(store.config, {
            nickName: displayName,
            greeting: typeof mapping.extra?.greeting === "string" ? mapping.extra.greeting : undefined,
        });
        if (greeting) narrator?.speak(greeting);

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
        };
        ;
    }

    function submitSelectForm(e: SubmitEvent) {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.target as HTMLFormElement).entries());

        handleEntry(String(formData.serialId || ""), mode);
    }

    function handleScan(raw: string) {
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
    ], {
        stepInitMinMs: 137,
    });

    function openStaffDrawer() {
        layerManager.pushComponent(StaffDrawer, { store}, {
            heading: `${m["baroo.staff.title"]()} — ${store.snapshot?.bar.name}`
        })
    }

    onMount(() => {
        return () => {
            boot.destroy()
        };
    });

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
                            placeholder={m["baroo.bar.pos.id_input_placeholder"]()}
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

        {#if store.isStaffDevice}
            <OfferStockBoard {store} />
        {/if}
    </div>
</main>

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

:global(.message-stream) {
    position: fixed;
    inset-block-end: 0.25rem;
    inset-inline-start: 0.25rem;
    width: min(30ch, 90vw);
}
</style>
