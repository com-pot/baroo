/// <reference path="../pb_data/types.d.ts" />

const TapsCollection = "bar_taps";

/**
 * How events and kiosks refer to a tap
 * @param {core.Record} tap
 * @returns {string}
 */
function tapRef(tap) {
    return String(tap.getInt("sequence"));
}

/**
 * What a tap gets to know about itself
 *
 * @param {core.App} app
 * @param {core.Record} tap
 */
function tapResponse(app, tap) {
    const bar = app.findRecordById("bars", tap.getString("bar"));

    let nowServing = null;
    const servingId = tap.getString("nowServing");
    if (servingId) {
        try {
            nowServing = app.findRecordById("bar_offer_items", servingId).getString("key");
        } catch {
            nowServing = null;
        }
    }

    return {
        id: tap.id,
        sequence: tap.getInt("sequence"),
        name: tap.getString("name"),
        model: tap.getString("model"),
        config: readJson(tap, "config"),
        nowServing,
        bar: {
            id: bar.id,
            slug: bar.getString("slug"),
            name: bar.getString("name"),
        },
    };
}

/**
 * Sets the tap to pour the item of the package last unsealed onto it, nothing once that
 * is flushed
 *
 * @param {core.App} app
 * @param {string} tapId
 */
function recomputeNowServing(app, tapId) {
    let tap;
    try {
        tap = app.findRecordById(TapsCollection, tapId);
    } catch {
        return;
    }

    const [open] = app.findRecordsByFilter(
        "bar_offer_packages",
        "tap = {:tap} && unsealedAt != '' && flushedAt = ''",
        "-unsealedAt",
        1,
        0,
        { tap: tapId },
    );
    const serving = open ? open.getString("offerItem") : "";
    if (tap.getString("nowServing") === serving) return;

    tap.set("nowServing", serving);
    app.save(tap);
}

function readJson(record, field) {
    const raw = record.getString(field);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

module.exports = {
    TapsCollection,
    tapRef,
    tapResponse,
    recomputeNowServing,
    readJson,
};
