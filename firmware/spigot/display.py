"""
The station's display: a 2.8" ILI9341 panel, 240x320, on SPI1. Wiring in README.md.

The venue server draws every screen, and the station streams the pixels to the panel as
they arrive without looking at them. The only screens drawn here are the ones that have
to work without a server: starting up, server unreachable. They use MicroPython's own
8x8 font, which has no diacritics, so they are plain ASCII.
"""

import io
import time

import framebuf
import requests
from machine import Pin, SPI

try:
    import deflate
except ImportError:
    # Without it every screen comes uncompressed, about 150 KB instead of under 10 KB.
    deflate = None

WIDTH = 240
HEIGHT = 320
SCREEN_BYTES = WIDTH * HEIGHT * 2

# SPI1. MISO is named even though nothing reads the panel: left out, MicroPython would
# claim its default for SPI1, GP8 — which is DC here.
PIN_SCK = 10
PIN_MOSI = 11
PIN_MISO = 12
PIN_CS = 13
PIN_DC = 8
PIN_RST = 9
PIN_BACKLIGHT = 14

# RGB565, matching the server's screens.
BACKGROUND = 0x10C4  # #111827
TEXT = 0xFFFF
MUTED = 0x9D15  # #9ca3af
ERROR = 0xD924  # #dc2626

# The usual ILI9341 start-up sequence: power, VCOM, 16-bit pixels, gamma.
_INIT = (
    (0xEF, b"\x03\x80\x02"),
    (0xCF, b"\x00\xc1\x30"),
    (0xED, b"\x64\x03\x12\x81"),
    (0xE8, b"\x85\x00\x78"),
    (0xCB, b"\x39\x2c\x00\x34\x02"),
    (0xF7, b"\x20"),
    (0xEA, b"\x00\x00"),
    (0xC0, b"\x23"),
    (0xC1, b"\x10"),
    (0xC5, b"\x3e\x28"),
    (0xC7, b"\x86"),
    (0x37, b"\x00"),
    (0x3A, b"\x55"),
    (0xB1, b"\x00\x18"),
    (0xB6, b"\x08\x82\x27"),
    (0xF2, b"\x00"),
    (0x26, b"\x01"),
    (0xE0, b"\x0f\x31\x2b\x0c\x0e\x08\x4e\xf1\x37\x07\x10\x03\x0e\x09\x00"),
    (0xE1, b"\x00\x0e\x14\x03\x11\x07\x31\xc1\x48\x08\x0f\x0c\x31\x36\x0f"),
)

# What the plain-text screens make of Czech letters.
_PLAIN = {
    "á": "a", "č": "c", "ď": "d", "é": "e", "ě": "e", "í": "i", "ň": "n", "ó": "o",
    "ř": "r", "š": "s", "ť": "t", "ú": "u", "ů": "u", "ý": "y", "ž": "z",
    "Á": "A", "Č": "C", "Ď": "D", "É": "E", "Ě": "E", "Í": "I", "Ň": "N", "Ó": "O",
    "Ř": "R", "Š": "S", "Ť": "T", "Ú": "U", "Ů": "U", "Ý": "Y", "Ž": "Z",
}


class Display:
    def __init__(self, madctl=0x48, baudrate=40000000):
        self.cs = Pin(PIN_CS, Pin.OUT, value=1)
        self.dc = Pin(PIN_DC, Pin.OUT, value=0)
        self.rst = Pin(PIN_RST, Pin.OUT, value=1)
        self.backlight = Pin(PIN_BACKLIGHT, Pin.OUT, value=0)
        self.spi = SPI(1, baudrate=baudrate, polarity=0, phase=0,
                       sck=Pin(PIN_SCK), mosi=Pin(PIN_MOSI), miso=Pin(PIN_MISO))
        self._chunk = bytearray(4096)

        self.rst.value(0)
        time.sleep_ms(10)
        self.rst.value(1)
        time.sleep_ms(120)

        for command, data in _INIT:
            self._command(command, data)
        # Memory access order: portrait, 240 wide. 0x48 suits most of these modules; one
        # showing red and blue swapped wants 0x40, one drawn mirrored wants 0x88.
        self._command(0x36, bytes((madctl,)))
        self._command(0x11)  # wake up
        time.sleep_ms(120)
        self._command(0x29)  # display on

        self.fill(BACKGROUND)
        self.backlight.value(1)

    # --- screens from the server --------------------------------------------------------

    def show_remote(self, url, headers, timeout):
        """Streams a screen the server rendered onto the panel. Raises if it falls short."""
        if deflate:
            url += "&z=1"
        response = requests.get(url, headers=headers, timeout=timeout)
        try:
            if response.status_code != 200:
                raise RuntimeError("screen: HTTP {}".format(response.status_code))

            if deflate:
                # The decompressor reads only native streams, and requests hands the body
                # over as a Python one — so the few KB of it are read first, then
                # inflated from memory straight onto the panel.
                stream = deflate.DeflateIO(io.BytesIO(response.content), deflate.ZLIB)
            else:
                stream = response.raw
            view = memoryview(self._chunk)
            left = SCREEN_BYTES

            self._begin(0, 0, WIDTH - 1, HEIGHT - 1)
            try:
                while left > 0:
                    n = stream.readinto(view[:min(left, len(view))])
                    if not n:
                        raise RuntimeError("screen: cut short")
                    self.spi.write(view[:n])
                    left -= n
            finally:
                self._end()
        finally:
            response.close()

    # --- screens drawn here -------------------------------------------------------------

    def message(self, lines, tone="normal"):
        """A screen of centred plain-text lines, for when the server cannot be asked.

        `tone` is "normal", "muted" (grey text) or "error" (white on red).
        """
        color = MUTED if tone == "muted" else TEXT
        background = ERROR if tone == "error" else BACKGROUND
        self.fill(background)
        line_height = 26
        y = (HEIGHT - line_height * len(lines)) // 2
        for line in lines:
            self.text(line, y, color=color, background=background)
            y += line_height

    def text(self, text, y, scale=2, color=TEXT, background=BACKGROUND):
        text = "".join(_PLAIN.get(ch, ch if ord(ch) < 128 else "?") for ch in text)
        text = text[: WIDTH // (8 * scale)]
        if not text:
            return

        width = len(text) * 8
        glyphs = framebuf.FrameBuffer(bytearray(width), width, 8, framebuf.MONO_HLSB)
        glyphs.text(text, 0, 0, 1)

        ink = bytes((color >> 8, color & 0xFF)) * scale
        paper = bytes((background >> 8, background & 0xFF)) * scale
        left = (WIDTH - width * scale) // 2

        self._begin(left, y, left + width * scale - 1, y + 8 * scale - 1)
        try:
            for row in range(8):
                line = b"".join(ink if glyphs.pixel(col, row) else paper for col in range(width))
                for _ in range(scale):
                    self.spi.write(line)
        finally:
            self._end()

    def fill(self, color):
        row = bytes((color >> 8, color & 0xFF)) * WIDTH
        self._begin(0, 0, WIDTH - 1, HEIGHT - 1)
        try:
            for _ in range(HEIGHT):
                self.spi.write(row)
        finally:
            self._end()

    # --- the panel ----------------------------------------------------------------------

    def _command(self, command, data=None):
        self.cs.value(0)
        self.dc.value(0)
        self.spi.write(bytes((command,)))
        if data:
            self.dc.value(1)
            self.spi.write(data)
        self.cs.value(1)

    def _begin(self, x0, y0, x1, y1):
        """Opens a window for pixels: what is written until _end() fills it row by row."""
        self._command(0x2A, bytes((x0 >> 8, x0 & 0xFF, x1 >> 8, x1 & 0xFF)))
        self._command(0x2B, bytes((y0 >> 8, y0 & 0xFF, y1 >> 8, y1 & 0xFF)))
        self.cs.value(0)
        self.dc.value(0)
        self.spi.write(b"\x2c")
        self.dc.value(1)

    def _end(self):
        self.cs.value(1)
