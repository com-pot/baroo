# REQ-BAR-01 Offer
Baroo keeps track of individual bars and offered items. Each item declares a *serving preset*, which fixes the portions it can be ordered in, how much of a package each portion draws, and the measure that draw is counted in:

- `tap` — 0.3 l and 0.5 l pours, keyed `0_3` / `0_5`; measured in `volume`
- `unit` — a single piece, keyed `1`; measured in `count`

The item's `pricing` map is keyed by those serving keys, so a price always corresponds to one concrete serving. Presets live in `src/lib/bar/servings.ts`.

In app there's a backstage page allowing users with role bar-manager to manage said bars and offer items and their pricings.
