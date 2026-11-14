# REQ-BAR-02 Overview
Baroo allows to display dashboard-like overview of bar that shows stats about the bar members and offer items.

Stock is kept per package — a keg, a case — in `bar_offer_packages`: its offer item, an optional `label`, the `quantity` it holds in its item's `measure` (30 litres from a tap, 24 bags out of a box), and optionally the NFC `tagSerial` that unseals it at a tap. A package is *registered* (in backstage, *Nabídka*), *unsealed* (`unsealedAt`, `tap` while it is on one) and *flushed* (`flushedAt`) once done with. Unsealing a package nobody registered registers it there and then — a kiosk mints its id before it syncs — so every package an order draws from exists.

One package is open per slot: a tap, or an item's packages off the taps. Unsealing another one there flushes what was open; one unsealed later than that stays open, a kiosk syncing late does not get to close it. Flushing closes the package wherever it is.

Each order item refers to the `tap` it was poured from and the `package` it drew from. The server decides the package when it files the order: the one open on its tap at `orderedAt`, or the item's package off the taps for an order not poured from one. What is left of a package is its `quantity` less what its orders drew.

The events collection keeps the log of it, an `unseal`:

```json
{
    "type": "unseal",
    "target": "bar:bar-2025",
    "data": {
        "offerItemKey": "bernard-12",
        "quantity": 30,
        "tap": "1",
        "packageId": "k3w0x8y2c1v9b7n"
    }
}
```

`tap` is the tap the package went on, by its `sequence` in `bar_taps`, `null` for none. A `flush` keeps what the package came to:

```json
{
    "type": "flush",
    "target": "bar:bar-2025",
    "data": {
        "offerItemKey": "bernard-12",
        "tap": "1",
        "packageId": "k3w0x8y2c1v9b7n",
        "closureData": { "unsealedAt": "…", "quantity": 30, "totalQuantity": 28.4, "variantCounts": { "0_5": 50, "0_3": 11 }, "…": "…" }
    }
}
```

Events from before packages carry no `packageId` — those unseals added to the item's stock unless `flushCurrent`, and the oldest carry `closureData` themselves.

A tap pours the item of the package open on it. A PocketBase hook keeps `bar_taps.nowServing` in step whenever a package changes.

## Taps
Taps are prepared in backstage (*Pípy*), one `bar_taps` record each: its `sequence` (how events and kiosks call it), an optional `name`, the POS device it belongs to, its `model` (`tap-tapper_v1.0`) with that model's `config`, and `nowServing`.

`bar_taps` is an auth collection: a tap acts in PocketBase as itself, with a token that *authorizing* it in backstage issues. Authorizing saves the config, refreshes the tap's token key — which revokes its previous token — and hands back `config.py` with the new token in it; the token is not stored. `configChecksum` is the hash of that file without its token, so backstage tells when the config or the wifi it uses changed since (*Changed config not authorized*). `validThrough` is when the token runs out, a year after authorizing.

TapTappers are online-only. Every request goes through the SvelteKit server to PocketBase as the tap — which also marks it `lastSeen`; the TapTapper says hello every 20 s. Scanning a package tag files its unseal, and an order for a member's card is filed by the tap too, once its size is picked on the TapTapper's buttons. Kiosks have no part in either: they stay offline-first, watch what is on the taps and get the taps' orders and unseals with their next pull.

Wifi networks the taps may join are kept per bar in `app_settings` (`namespace` `bar:<slug>`, `key` `wifiNetworks`), so a tap's config only picks one.

## Stats
Initial stats to implement are:

### Package usage
This stat summarizes the order items of a package grouped by serving. Below the grouped serving counts we'll display the total drawn from it, each serving contributing its own quantity:
`count(variant=0_5) * 0.5 + count(variant=0_3) * 0.3`

Every item has a measure, so items sold by the piece get a total too — 17 ks rather than 17 l. Against the package's `quantity` that gives roughly how much of it is left. Order rows whose variant is not among the item's servings are grouped under "other" and count for nothing.

### Total members' order items
This stat displays "high-score" like list of top purchaser members. It's calculated by loading all members and left-joining count of their orders.

