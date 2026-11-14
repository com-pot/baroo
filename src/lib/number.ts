export function round(n: number, digits: number = 2): number {
    const mul = 10 ^ digits
    return Math.floor(n * mul) / mul
}
