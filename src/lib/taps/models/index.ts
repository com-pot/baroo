import type z from 'zod';
import { tapTapperV1 } from './tap-tapper_v1.0';
import type { TapModel } from './tapModel';

export const tapModels = {
    [tapTapperV1.key]: tapTapperV1,
} as Record<string, TapModel>;

export const tapModelKeys = Object.keys(tapModels);
export const DEFAULT_TAP_MODEL = tapTapperV1.key;

export function tapModel(key: string): TapModel | null {
    return tapModels[key] ?? null;
}

/** The stored config as the model reads it now, defaults for whatever is missing or invalid */
export function readTapConfig(model: TapModel, raw: unknown): z.infer<TapModel["configSchema"]> {
    const parsed = model.configSchema.safeParse(raw ?? {});
    if (parsed.success) return parsed.data;

    const fallback = model.configSchema.parse({});
    // Keeps the fields that still read, so one bad value doesn't reset the rest
    const kept = Object.fromEntries(Object.entries((raw ?? {}) as Record<string, unknown>).filter(([name, value]) => {
        const field = model.configSchema.shape[name] as z.ZodType | undefined;
        return field?.safeParse(value).success;
    }));

    return { ...fallback, ...kept };
}
