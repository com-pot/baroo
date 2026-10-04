import * as z from "zod";

export function zWalk(schema: z.ZodType, cb: (schema: z.ZodType, path: string[]) => unknown): void {
    const toWalk: [z.ZodType, string[]][] = [
        [schema, []],
    ]
    let current: typeof toWalk[number] | undefined
    while (current = toWalk.shift()) {
        const [schema, path] = current
        if (schema instanceof z.ZodObject) {
            for (const [key, child] of Object.entries(schema.shape)) {
                toWalk.push([child, [...path, key]])
            }
            continue;
        }

        if (schema instanceof z.ZodArray) {
            toWalk.push([schema.element as z.ZodType, [...path, "[]"]]);
            continue;
        }

        cb(schema, path)
    }
}

export function zFromForm(schema: z.ZodType, data: FormData) {
    const result: Record<string, unknown> = {}
    zWalk(schema, (part, path) => {
        result[path.join('.')] = data.get(path.join('.'))
    })

    return result
}
