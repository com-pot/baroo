import z from "zod";

export const barSchema = z.object({
    slug: z.string().min(2).max(40).regex(/^[a-z0-9\\-]+$/).describe("Unique slug identifier for the bar"),
    name: z.string().min(2).describe("Display name of the bar"),
})
