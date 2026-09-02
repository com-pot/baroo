import type { BarMember } from "./BarModel"

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

    public async bulkImport(csvData: string): Promise<{ success: number, errors: string[] }> {
        const errors: string[] = [];
        let success = 0;

        const lines = csvData.trim().split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                const mapping = parseImportLine(line);
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
}

/** Parses one tab-separated `seq\tnickName\tserialId` import line. */
export function parseImportLine(line: string): ImportMapping | null {
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
