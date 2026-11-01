# Copy to config.py on the Pico and fill in. Every TapTapper gets the same file except
# for TAP_ID. config.py is gitignored: it holds the wifi password and the secret.

WIFI_SSID = "bar-wifi"
WIFI_PASSWORD = "change-me"
# Two-letter country code; it decides which wifi channels the radio may use.
WIFI_COUNTRY = "CZ"

# Where baroo runs. In the bar: the RPi on plain http, by IP address — MicroPython cannot
# resolve .local names. While developing: your computer's LAN address and the vite dev
# server, e.g. "https://192.168.1.23:5173" (its self-signed certificate is fine here).
SERVER = "http://192.168.1.10:3000"

# The bar's slug, as in /bar/<slug>.
BAR = "my-bar"

# The tap this TapTapper sits at; the kiosk shows it as "Pípa 1". Lowercase letters,
# digits, dashes.
TAP_ID = "1"

# Must match TAP_SECRET in the server's .env.
TAP_SECRET = "change-me"

# Optional buzzer module on GP15. None = signal on the on-board LED only.
BUZZER_PIN = 15
# Some 3-pin buzzer modules sound while their input is LOW.
BUZZER_ACTIVE_LOW = False

# A 2.8" ILI9341 display on SPI1 (README.md, "Display"). False for a TapTapper without one.
DISPLAY = True
# How the panel is driven: 0x48 suits most of these modules. Red and blue swapped: 0x40.
# Upside down: 0x88. Mirrored: 0x08.
DISPLAY_MADCTL = 0x48

# Size buttons on the TapTapper (README.md, "Size buttons"): which GPIO pin each serving's
# button is on, yellow Malé and red Velké. None for a TapTapper without them. Only the
# sizes the drink on tap is offered in show on the screen and answer a press.
SIZE_BUTTONS = {"0_3": 1, "0_5": 0}

# Reboots the TapTapper if it ever hangs. Set to False while working in Thonny: once
# started the watchdog cannot be stopped, and it would reboot the Pico under the REPL.
WATCHDOG = True
