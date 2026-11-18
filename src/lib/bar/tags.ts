import z from "zod";
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


export const tagSerialSchema = z.string()
    .transform(normalizeTag)
    .pipe(z.string().regex(/^[0-9a-f]{4,40}$/))

export function normalizeTag(serial: string): string {
    return serial.trim()
        .replaceAll(/\:/g, '')
        .toLowerCase()
}

export function decimalToHex(raw: string): string {
    const digits = raw.trim()
    if (!/^\d+$/.test(digits)) return digits

    let hex = BigInt(digits).toString(16)
    hex = hex.padStart(Math.max(8, hex.length + hex.length % 2), '0')

    return hex.match(/../g)!.reverse().join('')
}
