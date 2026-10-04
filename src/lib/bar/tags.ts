import type { BarMember } from "./BarModel"

export type TagMapping = {
    serialId: string,
    member: Pick<BarMember, "id" | "nickName" | "seq">
    extra?: Record<string, unknown>,
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
