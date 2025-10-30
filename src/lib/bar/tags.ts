import type { StorageRef } from "./storage.server"

export class TagMapper {
    private _mappings: {tag: string, userId: string, nickName: string}[] = []

    public get mappings(): Readonly<typeof this._mappings> {
        return this._mappings
    }

    get key(): string {
        return `mappings.${this.ref.key}`
    }

    constructor(private ref: StorageRef) {
        if (ref.type !== 'local') {
            throw new Error("TagMapper only supports local storage refs")
        }
    }

    public isValid(data: unknown): data is TagMapper['_mappings'][0] {
        if (typeof data !== 'object' || data === null) return false
        const d = data as Record<string, unknown>
        return typeof d.tag === 'string'
            && typeof d.userId === 'string'
            && typeof d.nickName === 'string'
    }

    /**
     * @param {TagMapper['_mappings'][0]} item
     */
    public async put(item: TagMapper['_mappings'][0]) {
        this._mappings = [
            ...this._mappings.filter(m => m.tag !== item.tag),
            item,
        ]

        await this.save()
    }

    private async save() {
        localStorage.setItem(this.key, JSON.stringify(this._mappings))
    }

    public async load() {
        const stored = localStorage.getItem(this.key)
        this._mappings = ((stored ? JSON.parse(stored) : []) as TagMapper['_mappings'])
            .filter(m => m.tag && m.userId && m.nickName)
    }

    async get(tag: TagMapper['_mappings'][0]['tag']) {
        return this._mappings.find(m => m.tag === tag)
    }
}
