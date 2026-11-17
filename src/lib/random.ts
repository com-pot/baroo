export function randNum(max: number, min: number = 0) {
    const range = max - min
    return Math.random() * range + min
}

export function randArrItem<T>(items: readonly T[]): T {
    const i = Math.floor(Math.random() * items.length)
    return items[i]
}

