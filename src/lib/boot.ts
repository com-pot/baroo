const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BootOpts = {
    stepInitMinMs: number,
    summaryLingerMs: number,
}

const defaults: BootOpts = {
    stepInitMinMs: 0,
    summaryLingerMs: 1_000,
}

export class Boot {

    public bootResult: ReturnType<typeof runBoot> | null = null;
    public readonly opts: Readonly<BootOpts>

    constructor(
        public readonly features: BootFeature[],
        opts?: Partial<BootOpts>,
    ) {
        this.opts = { ...defaults, ...opts }
    }

    public run() {
        if (this.bootResult) {
            return this.bootResult
        }

        return this.bootResult = runBoot(this.features, this.opts)
    }

    destroy() {
        this.bootResult?.destroy()
    }
}

export function runBoot(defined: BootFeature[], opts: BootOpts) {
    const features = defined.filter((feature) => feature.isEnabled?.() ?? true)

    const { bootEl, listEl } = mountPanel()

    const rows = features.map((feature) => ({
        feature,
        ...createRow(listEl, feature.name, feature.name),
    }))
    const summary = createRow(listEl, "…")
    summary.el.classList.add("summary")

    const allReady = (async () => {
        for (const [index, row] of [...rows, summary].entries()) {
            row.el.dataset.bootRow = "pending"
        }

        for (const { feature, el, status } of rows) {
            el.dataset.bootRow = "working"
            status.innerText = "⏳"

            const featureEl = (document.querySelector(`[data-boot-feature="${feature.name}"]`) || undefined) as HTMLElement | undefined

            const started = Date.now()
            try {
                feature.result = { status: "fulfilled", value: await feature.init(featureEl) }
            } catch (reason) {
                feature.result = { status: "rejected", reason }
            }
            await sleep(Math.max(0, opts.stepInitMinMs - (Date.now() - started)))

            const ok = feature.result.status === "fulfilled"
            el.dataset.bootRow = ok ? "ok" : "error"
            status.innerText = ok ? "✅" : "❌"

            if (!ok) {
                const reason = document.createElement("code")
                reason.classList.add("code")
                reason.innerText = String((feature.result as PromiseRejectedResult).reason)
                el.appendChild(reason)
            }

            if (featureEl) {
                featureEl.dataset.bootStatus = ok ? 'ready' : 'error'
            }
        }

        document.body.dataset.bootStatus = "ready"

        const failed = features.filter((feature) => feature.result!.status === 'rejected')
        const ok = failed.length === 0

        summary.el.dataset.bootRow = ok ? "ok" : "error"
        summary.status.innerText = ok ? "✅" : "❌"
        summary.caption.innerText = ok ? "Ok" : `${failed.length}/${features.length} ✗`

        if (ok) {
            await sleep(opts.summaryLingerMs)
            bootEl.setAttribute("aria-hidden", "true")
        }

        summary.el.appendChild(createCloseButton(bootEl))
    })()

    return {
        allReady,
        destroy: () => {
            bootEl.remove()

            for (let feature of features) {
                if (feature.result?.status === "fulfilled" && typeof feature.result.value === "function") {
                    feature.result.value()
                }
            }
        }
    }
}

function mountPanel() {
    let bootEl = document.querySelector(".boot") as HTMLElement | null
    if (!bootEl) {
        bootEl = document.createElement("div")
        bootEl.classList.add("boot")
        document.body.appendChild(bootEl)
    }
    bootEl.removeAttribute("aria-hidden")

    let listEl = bootEl.querySelector("ul")
    if (!listEl) {
        listEl = document.createElement("ul")
        bootEl.appendChild(listEl)
    }
    listEl.replaceChildren()

    return { bootEl, listEl }
}

function createRow(listEl: HTMLUListElement, caption: string, feature?: string) {
    const el = document.createElement("li")
    if (feature) el.dataset.feature = feature
    el.dataset.bootRow = "queued"

    const statusEl = document.createElement("span")
    statusEl.classList.add("status")
    statusEl.innerText = "📦"

    const captionEl = document.createElement("span")
    captionEl.classList.add("caption")
    captionEl.innerText = caption

    el.append(statusEl, captionEl)
    listEl.appendChild(el)

    return { el, status: statusEl, caption: captionEl }
}

function createCloseButton(bootEl: HTMLElement) {
    const button = document.createElement("button")
    button.type = "button"
    button.classList.add("close")
    button.innerText = "Close"
    button.addEventListener("click", () => bootEl.setAttribute("aria-hidden", "true"))

    return button
}

export type BootFeature = {
    name: string;
    isEnabled?: () => boolean;
    init: (featureEl?: HTMLElement) => Promise<any>;
    result?: PromiseSettledResult<any>;
}
