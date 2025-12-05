export class Boot {

    public bootResult: ReturnType<typeof runBoot> | null = null;

    constructor(
        public readonly features: BootFeature[],
    ) {

    }

    public run() {
        if (this.bootResult) {
            return this.bootResult
        }

        return this.bootResult = runBoot(this.features)
    }

    destroy() {
        this.bootResult?.destroy()
    }
}

export function runBoot(features: BootFeature[]) {
    let bootEl = document.querySelector(".boot")
    if (!bootEl) {
        bootEl = document.createElement("div")
        bootEl.classList.add("boot")
        document.body.appendChild(bootEl)
    }

    let listEl = bootEl.querySelector("ul")
    if (!listEl) {
        listEl = document.createElement("ul")
        bootEl.appendChild(listEl)
    }
    bootEl.querySelector("button")?.remove()

    let promises: Promise<any>[] = []
    for (let feature of features) {
        const li = document.createElement("li")
        li.dataset.feature = feature.name

        const status = document.createElement("span")
        status.classList.add("status")
        status.innerText = "⏳"

        const caption = document.createElement("span")
        caption.classList.add("caption")
        caption.innerText = feature.name

        li.append(status, caption)
        listEl.appendChild(li)

        const featureEl = (document.querySelector(`[data-boot-feature="${feature.name}"]`) || undefined) as HTMLElement | undefined

        const featureReady = feature.init(featureEl)
            .then((value) => {
                feature.result = { status: "fulfilled", value }
            })
            .catch((reason) => {
                feature.result = { status: "rejected", reason }
            })
            .then(() => {
                status.innerText = feature.result!.status === "fulfilled" ? "✅" : "❌"
                if (feature.result!.status === "rejected") {
                    const reason = document.createElement("code")
                    reason.classList.add("code")
                    reason.innerText = String(feature.result!.reason)
                    reason.style.display = "block"
                    reason.style.whiteSpace = "pre-wrap"
                    li.appendChild(reason)
                }
                if (featureEl) {
                    featureEl.dataset.bootStatus = feature.result!.status === 'fulfilled' ? 'ready' : 'error'
                }
            })
        promises.push(featureReady)
    }

    const allReady = Promise.all(promises).then(async () => {
        document.body.dataset.bootStatus = "ready"
        if (features.some((feature) => feature.result!.status === 'rejected')) {
            return
        }
        await new Promise((r) => setTimeout(r, 2000))
        bootEl.setAttribute("aria-hidden", "true")
    })

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

type BootFeature = {
    name: string;
    init: (featureEl?: HTMLElement) => Promise<any>;
    result?: PromiseSettledResult<any>;
}
