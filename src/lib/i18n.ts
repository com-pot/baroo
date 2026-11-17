import { m } from "$lib/paraglide/messages"
export type Localized<T> = Record<string, T>

export type Printable = string | Localized<string> | MessageRef

export type MessageRef<T extends string & keyof typeof m = keyof typeof m> = {
    $t: T,
    data: Parameters<typeof m[T]>[0],
}

export function messageRef<T extends string & keyof typeof m>($t: T, data: MessageRef<T>["data"]): MessageRef<T> {
    return { $t, data }
}

export function isMessageRef<T extends string & keyof typeof m>(subject: unknown): subject is MessageRef<T> {
    if (!subject || typeof subject !== "object") return false
    return "$t" in subject
}
export function printMessageRef<T extends string & keyof typeof m>(ref: MessageRef<T>) {
    return (m[ref.$t] as (data: unknown) => string)(ref.data)
}

export function messageOf(key: string): string | undefined {
    const messages = m as unknown as Record<string, (() => string) | undefined>;
    return key in messages ? messages[key]?.() : undefined;
}
