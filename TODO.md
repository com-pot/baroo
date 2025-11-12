# Baroo TODO
Here we put off tasks that ought to be addressed later in time.

## Categories

### Base functionality

1. Show summary based on actual orders - db/local

### Data structure

1. In bar_offer_items, the variants are broken up into columns pricing, variantLabels and variantVolumes. We'd better convert this into a singular dictionary of variants, each containing own price, label and ~~volume~~ content.
2. ~~Keg uncorking~~ Package unwrapping should not live merely in events but in its own table

### Design

1. For now, we assume every offer item is measured in liters. We want to also allow for grams, pieces, etc..
2. Make primary currency a parameter of the bar instead of a global setting / bunch of hardcoded strings
