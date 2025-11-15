import type { BarMember } from "./BarModel"
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

    async get(serialId: TagMapping['serialId']) {
        return this.mappings.find(m => m.serialId === serialId)
    }

    public async bulkImport(csvData: string): Promise<{ success: number, errors: string[] }> {
        const errors: string[] = [];
        let success = 0;

        const lines = csvData.trim().split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                const mapping = this.parseImportLine(line);
                if (mapping) {
                    // Convert ImportMapping to TagMapping (seq becomes userId for now)
                    const tagMapping: TagMapping = {
                        serialId: mapping.serialId,
                        userId: mapping.seq, // Using seq as userId as per requirements
                        nickName: mapping.nickName
                    };

                    await this.put(tagMapping);
                    success++;
                } else {
                    errors.push(`Line ${i + 1}: Invalid format`);
                }
            } catch (error) {
                errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        return { success, errors };
    }

    private parseImportLine(line: string): ImportMapping | null {
        const parts = line.split('\t');
        if (parts.length !== 3) {
            return null;
        }

        const [seq, nickName, serialId] = parts.map(p => p.trim());

        if (!seq || !nickName || !serialId) {
            return null;
        }

        return {
            seq,
            userId: seq, // seq is used as userId
            nickName,
            serialId
        };
    }
}

export type TagMapping = {
    serialId: string,
    userId: BarMember["id"],
    nickName: BarMember["nickName"],
    extra?: Record<string, unknown>,
}

export type ImportMapping = {
    seq: string,
    userId: BarMember["id"],
    nickName: BarMember["nickName"],
    serialId: string,
}
export function isValidMapping(data: unknown): data is TagMapping {
    if (typeof data !== 'object' || data === null) return false
    const d = data as Record<string, unknown>
    return typeof d.serialId === 'string' && d.serialId.length > 0
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
                    .filter(m => isValidMapping(m))
            },
            async put(mapping) {
                mappings = [
                    ...mappings.filter(m => m.serialId !== mapping.serialId),
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

export function normalizeTag(serialId: string): string {
    return serialId.trim()
        .replaceAll(/\:/g, '')
}
