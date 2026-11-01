# REQ-BAR-02 Overview
Baroo allows to display dashboard-like overview of bar that shows stats about the bar members and offer items.

For overview we'll be using the events collection which holds for example the unsealing of a package — a keg tapped, a case broken into — the structure for it looks as follows:

```json
{
    "type": "unseal",
    "target": "bar-2025:bernard-12",
    "data": {
        "offerItemKey": "bernard-12",
        "quantity": 30,
        "tap": "1",
        "packageId": "k3w0x8y2c1v9b7n",
        "flushCurrent": true
    }
}
```

`quantity` is what the package being opened holds, as the barman declares it, in the measure its serving preset uses — 30 litres from a tap, 24 bags out of a box. A package registered in `bar_offer_packages` (a kind of package, e.g. a 30 l keg, with the NFC tag that unseals one at a tap) gives it, and `packageId` remembers which. `tap` is the tap the package went on, `null` for none — the taps exist only through these events.

With `flushCurrent` the item's stock still open is closed first, by a `flush` event, which keeps what the closed stock came to:

```json
{
    "type": "flush",
    "target": "bar-2025:bernard-12",
    "data": {
        "offerItemKey": "bernard-12",
        "tap": "1",
        "closureData": { "unsealedAt": "…", "quantity": 30, "totalQuantity": 28.4, "variantCounts": { "0_5": 50, "0_3": 11 }, "…": "…" }
    }
}
```

Without it the new package adds to the open stock. A flush can also stand alone, for a package that is done with no new one after it. Unseals from before flush events carry `closureData` themselves and always closed the stock they replaced.

A tap pours the item last unsealed onto it, until that item is flushed.

## Stats
Initial stats to implement are:

### Package usage
This stat summarizes all the order items grouped by serving that were created no earlier than the unseal that opened the item's stock — the first one since its last flush. Below the grouped serving counts we'll display the total drawn from the stock, each serving contributing its own quantity:
`count(variant=0_5) * 0.5 + count(variant=0_3) * 0.3`

Every preset has a measure, so `unit` items get a total too — 17 ks rather than 17 l. Against the sum of the unsealed `quantity`s that gives roughly how much of the stock is left. Order rows whose variant predates serving presets are grouped under "other" and count for nothing.

### Total members' order items
This stat displays "high-score" like list of top purchaser members. It's calculated by loading all members and left-joining count of their orders.

