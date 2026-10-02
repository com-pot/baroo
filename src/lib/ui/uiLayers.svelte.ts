import { createContext, type Component, type ComponentProps, type Snippet } from "svelte";

type UiLayerCommon<Type extends string> = {
    id: string,
    type: Type,
    ctrl: UiLayerCtrl,

    heading?: Snippet | string,

    onDestroyed?: () => void,
}
export type UiComponentLayer<Props extends Record<string, unknown> = Record<string, unknown>> = UiLayerCommon<'component'> & { component: Component, props: Props }
export type UiSnippetLayer<Arg = unknown> = UiLayerCommon<'snippet'> & { snippet: Snippet<[Arg]>, arg: Arg }
export type UiLayer = UiComponentLayer | UiSnippetLayer

type OpenOpts = Omit<UiLayerCommon<string>, "id" | "type" | "ctrl">

export type UiLayerCtrl = {
    readonly id: string,
    close: () => void,
}

export class UiLayerManager {
    public layers = $state<UiLayer[]>([])
    public closing = $derived.by(() => this.layers.map(() => false))

    public pushComponent<Props extends Record<string, unknown>>(
        component: Component<Props>,
        props: ComponentProps<Component<Props>>,
        opts?: OpenOpts,
    ) {
        return this.pushLayer<UiComponentLayer<Props>>({
            type: "component",

            component: component as unknown as Component,
            props,
            ...opts,
        })
    }

    public pushSnippet<Arg = unknown>(
        snippet: Snippet<[Arg]>,
        arg: Arg,
        opts?: OpenOpts,
    ) {
        return this.pushLayer<UiSnippetLayer<Arg>>({
            type: "snippet",

            snippet,
            arg,
            ...opts,
        })
    }
    public pushLayer<T extends UiLayerCommon<string>>(layer: Omit<T, "ctrl"|"id">): T {
        const ctrl: UiLayerCtrl = Object.freeze({
            id: this.uniqueId(),
            close: () => {
                this.close(ctrl.id)
            },
        })

        this.layers = this.layers.toSpliced(this.layers.length, 0, {
            ...layer,
            id: ctrl.id,
            ctrl,
         } as unknown as UiLayer)

        // We can't return the layer in var because it's not identical to the one in $state
        //  hmm, I wonder what happens to the reference once another layer opens / closes.
        //  Haha, it's gonna be suuurely okay!
        return this.layers.at(-1) as unknown as T
    }

    public close(id: UiLayer["id"]) {
        const i = this.layers.findIndex((layer) => layer.id === id)
        if (i === -1) return console.warn("Unknown layer", { id })

        this.closing = this.closing.toSpliced(i, 1, true)
    }

    public destroy(id: UiLayer["id"]) {
        const iLayer = this.layers.findIndex((layer) => layer.id === id)
        if (iLayer === -1) {
            return console.warn('Layer not found', {id})
        }
        const layer = this.layers[iLayer]
        this.layers = this.layers.toSpliced(iLayer, 1)
        layer.onDestroyed?.()
    }

    private uniqueId(): string {
        const existingIds = new Set(this.layers.map((l) => l.id))

        let id = ''
        do {
            id = Math.round(Math.random() * 0xFFFF)
                .toString(16)
                .padStart(4, '0')
        } while (existingIds.has(id))
        return id
    }
}

export const [getUiLayers, setUiLayers] = createContext<UiLayerManager>()
