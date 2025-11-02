# REQ-BAR-02 Overview
Baroo allows to display dashboard-like overview of bar that shows stats about the bar members and offer items.

For overview we'll be using the events collection which holds for example keg uncorking, the structure for it looks as follows:

```json
{
    "type": "keg-uncork",
    "target": "bar-2025:bernard-12",
    "data": {}
}
```

## Stats
Initial stats to implement are:

### Keg usage
This stat summarizes all the order items grouped by variant that were created no earlier than last `keg-uncork` event. Below the grouped variant counts we'll display a total volume ordered following the formula:
`count(variant=1) * 0.5 + count(variant=x) * 0.3`

### Total members' order items
This stat displays "high-score" like list of top purchaser members. It's calculated by loading all members and left-joining count of their orders.

