import z from "zod";

export const barSchema = z.object({
    slug: z.string().min(2).max(40).regex(/^[a-z0-9\\-]+$/).describe("Unique slug identifier for the bar"),
    name: z.string().min(2).describe("Display name of the bar"),
})

export const barOfferItemSchema = z.object({
    bar: z.string().min(15).max(15).regex(/^[a-z0-9]+$/).describe("ID of the bar this item belongs to"),
    key: z.string().min(3).max(10).regex(/^[a-z][a-z0-9\-]+$/).describe("Unique key identifier for the offer item within a bar"),
    name: z.string().min(1).describe("Display name of the offer item"),
    servingPreset: z.string(),
    pricing: z.record(
        z.string().regex(/^[a-z0-9_]+$/),
        z.number().min(0),
    ),
    tagSerial: z.string().max(32).regex(/^[0-9a-f]*$/).describe("NFC tag that switches a spigot station to this item"),
})

export const barMemberMappingSchema = z.object({
    serialId: z.string().min(1).describe("Serial ID of a tag to map to a member"),
    userId: z.string().min(1).describe("User ID to associate with the tag"),
    nickName: z.string().min(1).describe("Nickname of the bar member"),
})
