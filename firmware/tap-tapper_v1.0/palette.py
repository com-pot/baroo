# Colors of the size buttons, by the index config.BUTTONS uses. Kept in the same order as
# src/lib/taps/models/tap-tapper_v1.0/palette.ts in baroo: only ever append.
PALETTE = (
    "yellow",
    "red",
    "green",
    "blue",
    "white",
    "black",
)


def color_name(index):
    return PALETTE[index] if 0 <= index < len(PALETTE) else "color {}".format(index)
