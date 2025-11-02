import type { StorageRef } from "./storage.server"

export class TagMapper {
    public get mappings(): Readonly<TagMapping[]> {
        return this.ctrl.getMappings()
    }

    private ctrl: MapperStorage

    constructor(private readonly ref: StorageRef) {
        this.ctrl = typeCtrls[this.ref.type](ref)
    }

    public isValid(data: unknown): data is TagMapping {
        return isValidMapping(data)
    }

    public async put(item: TagMapping) {
        await this.ctrl.put(item);
    }

    public async load() {
        await this.ctrl.load()
    }

    async get(tag: TagMapping['tag']) {
        return this.mappings.find(m => m.tag === tag)
    }
}

export type TagMapping = {tag: string, userId: string, nickName: string}
export function isValidMapping(data: unknown): data is TagMapping {
    if (typeof data !== 'object' || data === null) return false
    const d = data as Record<string, unknown>
    return typeof d.tag === 'string' && d.tag.length > 0
        && typeof d.userId === 'string' && d.userId.length > 0
        && typeof d.nickName === 'string' && d.nickName.length > 0
}

interface MapperStorage {
    put(mapping: TagMapping): Promise<void>;
    load(): Promise<void>;

    getMappings(): Readonly<TagMapping[]>;

}
const typeCtrls: Record<StorageRef["key"], (ref: StorageRef) => MapperStorage> = {
    local: ((ref) => {
        const key = `mappings.${ref.key}`
        let mappings = [] as TagMapping[]
        return ({
            async load() {
                const stored = localStorage.getItem(key)
                mappings = ((stored ? JSON.parse(stored) : []) as TagMapping[])
                    .filter(m => m.tag && m.userId && m.nickName)
            },
            async put(mapping) {
                mappings = [
                    ...mappings.filter(m => m.tag !== mapping.tag),
                    mapping,
                ]
                localStorage.setItem(key, JSON.stringify(mappings))
            },
            getMappings() {
                return mappings
            },
        })
    }),
    db: (ref) => {
        let mappings = [] as TagMapping[]

        return {
            getMappings: () => mappings,

            async load() {
                try {
                    const response = await fetch(`/api/bars/${ref.key}/mappings`);
                    if (!response.ok) {
                        throw new Error(`Failed to load mappings: ${response.status} ${response.statusText}`);
                    }
                    mappings = await response.json();
                } catch (error) {
                    console.error('Failed to load mappings from API:', error);
                    mappings = [];
                }
            },
            async put(mapping) {
                await fetch(`/api/bars/${ref.key}/mappings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapping)
                });
            }
        }
    },
}
