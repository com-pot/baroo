import * as z from "zod";
import * as m from "$lib/paraglide/messages.js";

export type FieldMeta = {
    /** Labels of enum values, by `${enumI18nPrefix}${value}` */
    enumI18nPrefix?: string;
    /** A select of the options the form gets under this name */
    optionsFrom?: string;
    /** Color swatches, the value is the picked one's index */
    palette?: readonly { key: string; fill: string; text?: string }[];
    /** Labels of the swatches, by `${paletteI18nPrefix}${key}` */
    paletteI18nPrefix?: string;
};

export type FieldKind = "string" | "number" | "boolean" | "enum" | "array" | "unknown";

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

    const kinds: Record<string, FieldKind> = {
        string: "string",
        number: "number",
        boolean: "boolean",
        enum: "enum",
        array: "array",
    };

    return { kind: kinds[base.type] ?? "unknown", base, nullable, meta };
}

/** A message by a key put together at runtime, `undefined` when there is none */
export function messageOf(key: string): string | undefined {
    const messages = m as unknown as Record<string, (() => string) | undefined>;
    return key in messages ? messages[key]?.() : undefined;
}
