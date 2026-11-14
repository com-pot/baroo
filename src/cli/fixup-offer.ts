import { type BarOfferItem } from "$lib/bar/BarModel";
import { SERVING_PRESETS } from "$lib/bar/servings";
import { createTokenDb } from "$lib/db.server";

if (!process.env.CLI_PB_AUTH_TOKEN) {
    console.error("No CLI_PB_AUTH_TOKEN")
    process.exit(1)
}
const pb = createTokenDb(process.env, process.env.CLI_PB_AUTH_TOKEN)

const items = await pb.collection<BarOfferItem>("bar_offer_items")
    .getFullList({
        filter: `(measure = "" || servings = null) && servingPreset != ""`,
    })

for (const item of items) {
    console.log("Updating ", item.id, item.name)
    const preset = SERVING_PRESETS.index[(item as unknown as {servingPreset: keyof typeof SERVING_PRESETS["index"]}).servingPreset]
    item.measure = preset.props.measure
    item.servings = preset.props.servings
        .map((serving) => ({
            ...serving,
            price: (item as unknown as {pricing: Record<string, number>}).pricing?.[serving.key] ?? 0,
        }))
    const result = await pb.collection('bar_offer_items')
        .update(item.id, item)
        .then(() => true)
        .catch((err) => err)

    if (result === true) {
        console.log("ok")
    } else {
        console.error(result)
    }

}
