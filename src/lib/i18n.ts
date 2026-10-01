export type Localized<T> = Record<string, T>

export type Printable = string | Localized<string>
