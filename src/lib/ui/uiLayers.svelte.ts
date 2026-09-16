import { createContext, type Component, type Snippet } from "svelte";

type UiLayerCommon<Type extends string> = {
    id: string,
    type: Type,

    heading?: Snippet | string,
}
type UiComponentLayer = UiLayerCommon<'component'> & { component: Component, props: object }
type UiLayer = UiComponentLayer

type OpenOpts = Omit<UiLayerCommon<string>, "id" | "type">

export class UiLayerManager {
    public layers = $state<UiLayer[]>([])

    public pushComponent<Props extends object, Cmp extends Component<Props>>(
        component: Cmp,
        props: Props,
        opts?: OpenOpts,
    ) {
        const layer: UiComponentLayer = {
            id: this.uniqueId(),
            type: "component",
            component: component as unknown as Component,
            props,
            ...opts,
        }

        this.layers = [...this.layers, layer]

        return layer
    }

    public close(id: UiLayer["id"]) {
        const iLayer = this.layers.findIndex((layer) => layer.id)
        if (iLayer === -1) {
            return console.warn('Layer not found', {id})
        }
        this.layers = this.layers.toSpliced(iLayer, 1)
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
