import type { BarMember } from "./BarModel"

export type TagMapping = {
    serialId: string,
    member: Pick<BarMember, "id" | "nickName" | "seq">
    extra?: Record<string, unknown>,
}

/**
 * Server-backed tag mapping, used by the backstage mapper where there is always a
 * connection. The kiosk does not use this — it reads mappings from its offline
 * snapshot and queues new ones as `tag-mapping` ops through `OfflineBar.process`.
 */
export class TagMapper {
    private cache: TagMapping[] = []

    constructor(private readonly barSlug: string) { }

    public get mappings(): Readonly<TagMapping[]> {
        return this.cache
    }

    public isValid(data: unknown): data is TagMapping {
        return isValidMapping(data)
    }

    public async load() {
        const response = await fetch(`/api/bars/${this.barSlug}/mappings`);
        if (!response.ok) {
            throw new Error(`Failed to load mappings: ${response.status} ${response.statusText}`);
        }
        this.cache = await response.json();
    }

    public async put(item: TagMapping) {
        const response = await fetch(`/api/bars/${this.barSlug}/mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        if (!response.ok) {
            throw new Error(`Failed to save mapping: ${response.status} ${response.statusText}`);
        }

        const saved: TagMapping = await response.json();
        this.cache = [...this.cache.filter(m => m.serialId !== saved.serialId), saved];

        return saved;
    }

    /** Unmaps a card. The member it pointed at is left alone. */
    public async remove(serialId: TagMapping['serialId']) {
        const response = await fetch(
            `/api/bars/${this.barSlug}/mappings?serialId=${encodeURIComponent(serialId)}`,
            { method: 'DELETE' },
        );
        if (!response.ok) {
            throw new Error(`Failed to remove mapping: ${response.status} ${response.statusText}`);
        }

        this.cache = this.cache.filter(m => m.serialId !== serialId);
    }

    async get(serialId: TagMapping['serialId']) {
        return this.mappings.find(m => m.serialId === serialId)
    }

    public async bulkImport(result: BulkImportData<TagMapping> ): Promise<{ success: number, errors: LineError[] }> {
        const errors: LineError[] = [];
        let success = 0;
        for (let i = 0; i < result.items.length; i++ ) {
            const mapping = result.items[i]
            await this.put({
                serialId: mapping.serialId,
                member: {
                    id: mapping.member.id || `${mapping.member.seq}`,
                    nickName: mapping.member.nickName,
                    seq: mapping.member.seq,
                },
            })
                .then(() => success++)
                .catch((err) => errors.push({line: i, error: `${err instanceof Error ? err.message : String(err)}`}))
        }

        return { success, errors };
    }
}

type LineError = { line: number, error: string }
export type BulkImportData<T> = {
    items: T[],
    errors: LineError[],
}

export function parseMappingFromCsv<T>(csvData: string, parseImportLine: (line: string) => T | null): BulkImportData<T> {
    const lines = csvData.trim().split('\n')
        .map((line, i) => ({line: i, data: line.trim()}))
        .filter(({ data }) => data.length);

    const result: BulkImportData<T> = {
        items: [],
        errors: [],
    }

    for (const entry of lines) {
        const mapping = parseImportLine(entry.data)
        if (mapping) {
            result.items.push(mapping)
        } else {
            result.errors.push({line: entry.line, error: `Invalid format`});
        }
    }

    return result
}

export function isValidMapping(data: unknown): data is TagMapping {
    if (typeof data !== 'object' || data === null) return false
    const d = data as Record<string, unknown>
    return typeof d.serialId === 'string' && d.serialId.length > 0
        && typeof d.userId === 'string' && d.userId.length > 0
        && typeof d.nickName === 'string' && d.nickName.length > 0
}

export function normalizeTag(serialId: string): string {
    return serialId.trim()
        .replaceAll(/\:/g, '')
        .toLowerCase()
}
