import type { BarMember } from "$lib/bar/BarModel";

const filesBase = `/storage/api/files/`

export function barMemberAvatar(memberId?: BarMember["id"], file?: string | null): string {
    if (!memberId || !file) return '/assets/default-badge.svg'
    return entityFileHref('bar_members', memberId, file)
}

export function entityFileHref(collection: string, id: string|number, file: string) {
    return `${filesBase}${collection}/${id}/${file}`
}
