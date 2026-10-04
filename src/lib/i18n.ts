import { type m } from "$lib/paraglide/messages"
export type Localized<T> = Record<string, T>

export type Printable = string | Localized<string>

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
