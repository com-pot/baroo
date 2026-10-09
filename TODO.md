# Baroo TODO
Here we put off tasks that ought to be addressed later in time.

## Categories

### Base functionality

1. ~~Show summary based on actual orders - db/local~~
2. ~~Import members from .csv structure~~

### Data structure

1. ~~In bar_offer_items, the variants are broken up into columns pricing, variantLabels and variantVolumes.~~ Replaced by a hardcoded `servingPreset` (`tap` = 0.3/0.5 l, `unit` = 1 piece); `pricing` is keyed by the preset's serving keys.
2. ~~Keg uncorking~~ Package unwrapping should not live merely in events but in its own table

### Design

1. ~~For now, we assume every offer item is measured in liters.~~ Pieces are covered by the `unit` serving preset; grams would be a third preset in `src/lib/bar/servings.ts`.
2. Make primary currency a parameter of the bar instead of a global setting / bunch of hardcoded strings
3. Manual item order

### DX & Performance

1. On hot-reload, the kiosk loses the member mapping - reload it
2. Add option to reload the offer
