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

type Scope = {
    layers: UiLayer[],
    closing: Record<UiLayer["id"], boolean>,
}

export class UiLayerManager {
    public scopes = $state<Record<string, Scope>>({})

    constructor(scopes: string[] = []) {
        for (const scope of ['default', ...scopes]) {
            this.scopes[scope] = {
                layers: [],
                closing: {}
            }
        }
    }

    public pushComponent<Props extends Record<string, unknown>>(
        component: Component<Props>,
        props: ComponentProps<Component<Props>>,
        opts?: OpenOpts & { scope?: string },
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
        opts?: OpenOpts & { scope?: string },
    ) {
        return this.pushLayer<UiSnippetLayer<Arg>>({
            type: "snippet",

            snippet,
            arg,
            ...opts,
        })
    }
    public pushLayer<T extends UiLayerCommon<string>>(layerConfig: Omit<T, "ctrl"|"id"> & { scope?: string}): T {
        const { scope = 'default', ...layer } = layerConfig
        if (!this.scopes[scope]) {
            throw new Error("Invalid scope " + scope)
        }

        const ctrl: UiLayerCtrl = Object.freeze({
            id: this.uniqueId(scope),
            close: () => {
                this.close(ctrl.id, scope)
            },
        })

        this.scopes[scope].layers = this.scopes[scope].layers.toSpliced(this.scopes[scope].layers.length, 0, {
            ...layer,
            id: ctrl.id,
            ctrl,
        } as unknown as UiLayer)

        this.scopes[scope].closing = {...this.scopes[scope].closing, [ctrl.id]: false}

        // We can't return the layer in var because it's not identical to the one in $state
        //  hmm, I wonder what happens to the reference once another layer opens / closes.
        //  Haha, it's gonna be suuurely okay!
        return this.scopes[scope].layers.at(-1) as unknown as T
    }

    public close(id: UiLayer["id"], scope = 'default') {
        if (!this.scopes[scope]) {
            throw new Error("Invalid scope " + scope)
        }

        const i = this.scopes[scope].layers.findIndex((layer) => layer.id === id)
        if (i === -1) return console.warn("Unknown layer", { scope, id })

        this.scopes[scope].closing = {...this.scopes[scope].closing, [id]: true}
    }

    public destroy(id: UiLayer["id"], scope = 'default') {
        if (!this.scopes[scope]) {
            throw new Error("Invalid scope " + scope)
        }
        const iLayer = this.scopes[scope].layers.findIndex((layer) => layer.id === id)
        if (iLayer === -1) {
            return console.warn('Layer not found', {id, scope})
        }
        const layer = this.scopes[scope].layers[iLayer]
        this.scopes[scope].layers = this.scopes[scope].layers.toSpliced(iLayer, 1)
        delete this.scopes[scope].closing[layer.id]
        layer.onDestroyed?.()
    }

    /**
     * Gets unique id for given existing scope
     */
    private uniqueId(scope: string): string {
        const existingIds = new Set(this.scopes[scope].layers.map((l) => l.id))

        let id = ''
        do {
            id = Math.round(Math.random() * 0xFFFF)
                .toString(16)
                .padStart(4, '0')
        } while (existingIds.has(id))
        return id
    }
}

export type LayerComponentProps = {
    ctrl: UiLayerCtrl,
    heading?: Snippet | string,
    children: Snippet,

    wrapperStyle?: string,

    closing: boolean,
    onClose?: (trigger: 'backdrop' | 'close' | 'destroy') => unknown,
}
export type LayerComponent = Component<LayerComponent>

export const [getUiLayers, setUiLayers] = createContext<UiLayerManager>()
