# Baroo TODO
Here we put off tasks that ought to be addressed later in time.

## Categories

### Base functionality

1. ~~Show summary based on actual orders - db/local~~
2. ~~Import members from .csv structure~~

### Data structure

1. ~~In bar_offer_items, the variants are broken up into columns pricing, variantLabels and variantVolumes.~~ Each item holds its `measure` and `servings`; `pricing` is keyed by the serving keys. `SERVING_PRESETS` only pre-fill them on the offer form.
2. ~~Keg uncorking~~ Package unwrapping should not live merely in events but in its own table

### Design

1. ~~For now, we assume every offer item is measured in liters.~~ Each item has its own `measure` (`volume`, `count`); grams would be a third one in `src/lib/si/measure.ts`.
2. Make primary currency a parameter of the bar instead of a global setting / bunch of hardcoded strings
3. Manual item order
4. Add visual feedback for order confirmation (onOrderDone)

### DX & Performance

1. On hot-reload, the kiosk loses the member mapping - reload it
2. Add option to reload the offer
3. Syncing across too many files?!

