export type ListIndex<K extends string, T extends Record<string, unknown> & {[key in K]: string}> = {
    [key in T[K]]: T & {[k in K]: key}
}
export function listIndex<K extends string, T extends Record<string, unknown> & {[key in K]: string}>(key: K, items: T[]) {
    const index = {} as ListIndex<K, T>
    for (const item of items) {
        index[item[key]] = item
    }

    return { items, index }
}

export function indexBy<K extends string, T extends Record<string, unknown> & {[key in K]: string}>(k: K, items: T[]): ListIndex<K, T> {
    const index = {} as ListIndex<K, T>
    for (const item of items) {
        index[item[k]] = item
    }

    return index
}
