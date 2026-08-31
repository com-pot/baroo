# REQ-BAR-02 Overview
Baroo allows to display dashboard-like overview of bar that shows stats about the bar members and offer items.

For overview we'll be using the events collection which holds for example the unsealing of a package — a keg tapped, a case broken into — the structure for it looks as follows:

```json
{
    "type": "unseal",
    "target": "bar-2025:bernard-12",
    "data": {
        "offerItemKey": "bernard-12",
        "quantity": 30
    }
}
```

`quantity` is what the package being opened holds, as the barman declares it, in the measure its serving preset uses — 30 litres from a tap, 24 bags out of a box.

## Stats
Initial stats to implement are:

### Package usage
This stat summarizes all the order items grouped by serving that were created no earlier than last `unseal` event. Below the grouped serving counts we'll display the total drawn from the package, each serving contributing its own quantity:
`count(variant=0_5) * 0.5 + count(variant=0_3) * 0.3`

Every preset has a measure, so `unit` items get a total too — 17 ks rather than 17 l. Against the unsealed `quantity` that gives roughly how much of the package is left. Order rows whose variant predates serving presets are grouped under "other" and count for nothing.

### Total members' order items
This stat displays "high-score" like list of top purchaser members. It's calculated by loading all members and left-joining count of their orders.

