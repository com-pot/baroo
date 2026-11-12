import * as z from "zod";
import * as m from "$lib/paraglide/messages.js";

export type FieldMeta = {
    optionsI18nPrefix?: string;
    optionsFrom?: string;
    /** Color swatches, the value is the picked one's index */
    palette?: readonly { key: string; fill: string; text?: string }[];
};

const kinds = {
    string: "string",
    number: "number",
    boolean: "boolean",
    enum: "enum",
    array: "array",
} as const

export type FieldKind = keyof typeof kinds | "unknown";

export type FieldShape = {
    kind: FieldKind;
    /** Without its default, optionality and nullability */
    base: z.ZodType;
    nullable: boolean;
    meta: FieldMeta;
};

/** What input a schema field calls for - its wrappers peeled off, their meta merged */
export function describeField(schema: z.ZodType): FieldShape {
    let base = schema;
    let nullable = false;
    let meta: FieldMeta = {};

    for (;;) {
        meta = { ...(base.meta() as FieldMeta | undefined), ...meta };

        if (base instanceof z.ZodDefault || base instanceof z.ZodOptional) {
            base = base.unwrap() as z.ZodType;
        } else if (base instanceof z.ZodNullable) {
            nullable = true;
            base = base.unwrap() as z.ZodType;
        } else {
            break;
        }
    }

    const kind: FieldKind = base.type in kinds ? kinds[base.type as keyof typeof kinds] : "unknown"
    return { kind, base, nullable, meta };
}
