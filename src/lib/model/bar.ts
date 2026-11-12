import { knownMeasures } from "$lib/si/measure";
import z from "zod";

export const barSchema = z.object({
    slug: z.string().min(2).max(40).regex(/^[a-z0-9\\-]+$/).describe("Unique slug identifier for the bar"),
    name: z.string().min(2).describe("Display name of the bar"),
    currency: z.string().min(3).max(3).regex(/^[a-z]{3}$/).describe("Currency of bar"),
})

export const barOfferItemSchema = z.object({
    bar: z.string().min(15).max(15).regex(/^[a-z0-9]+$/).describe("ID of the bar this item belongs to"),
    key: z.string().min(3).max(10).regex(/^[a-z][a-z0-9\-]+$/).describe("Unique key identifier for the offer item within a bar"),
    name: z.string().min(1).describe("Display name of the offer item"),
    measure: z.enum(knownMeasures.items.map((measure) => measure.name)).meta({
        optionsI18nPrefix: "generic.measure.mode.",
    }),
    servings: z.array(z.object({
        /** As orders and the TapTapper's buttons refer to the serving */
        key: z.string().regex(/^[0-9a-z_]{1,8}$/),
        label: z.string().min(1),
        quantity: z.number().gt(0),
        name: z.record(
            z.string().regex(/^[a-z]{2}$/),
            z.string().min(1),
        ),
        price: z.number().min(0)
    })).min(1).refine(
        (servings) => new Set(servings.map((serving) => serving.key)).size === servings.length,
        { message: "Serving keys must be unique" },
    ),
})

export const barOfferPackageSchema = z.object({
    offerItem: z.string().min(15).max(15).regex(/^[a-z0-9]+$/).describe("ID of the offer item the package holds"),
    label: z.string().max(40).describe("How the barman calls the package, e.g. Sud 50 l"),
    quantity: z.number().gt(0).describe("What the package holds, in the item's measure"),
    tagSerial: z.string().max(32).regex(/^[0-9a-f]*$/).describe("NFC tag that unseals a package of this kind onto a tap"),
})

export const barMemberMappingSchema = z.object({
    serialId: z.string().min(1).describe("Serial ID of a tag to map to a member"),
    userId: z.string().min(1).describe("User ID to associate with the tag"),
    nickName: z.string().min(1).describe("Nickname of the bar member"),
})
