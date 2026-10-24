"""
Baroo spigot station: a Raspberry Pi Pico W with an RC522 reader, one at each tap.

A beverage tag sets the drink this spigot pours. Any other card is a customer, and goes
to the kiosk tablet as a pour waiting for the barman to pick a size. The station knows
very little on purpose: the venue server says which tags are drinks, and only the kiosk
knows who anybody is.

Wiring, setup and what the beeps mean: README.md next to this file.
"""

import json
import time

import machine
import network
import requests
from machine import Pin

import config
from mfrc522 import MFRC522

# RC522 on SPI0 — the wiring table in README.md.
PIN_SCK = 18
PIN_MOSI = 19
PIN_MISO = 16
PIN_CS = 17
PIN_RST = 22

STATE_FILE = "state.json"

# A card counts as new once it has been out of the field this long. A card lying on the
# reader is re-read every 150-200 ms (see Reader._tocard), so holding it never pours
# twice; lifting it away and tapping again pours again almost at once.
CARD_GONE_MS = 500
# The server calls a station gone after 90 s without hearing from it.
HELLO_INTERVAL_MS = 30000
# An RC522 can go deaf after hours of polling. A soft reset is cheap, but it also wakes
# any card lying on the antenna — so only after the field has been empty a while.
READER_RESET_INTERVAL_MS = 60000
READER_RESET_IDLE_MS = 10000
HTTP_TIMEOUT_S = 5
WIFI_CONNECT_TIMEOUT_MS = 20000
# The RP2040 watchdog tops out at about 8.3 s; everything slow below stays under it.
WATCHDOG_MS = 8000

BUZZER_PIN = getattr(config, "BUZZER_PIN", None)
BUZZER_ACTIVE_LOW = getattr(config, "BUZZER_ACTIVE_LOW", False)

led = Pin("LED", Pin.OUT, value=0)
buzzer = None
if BUZZER_PIN is not None:
    buzzer = Pin(BUZZER_PIN, Pin.OUT, value=1 if BUZZER_ACTIVE_LOW else 0)

wlan = network.WLAN(network.STA_IF)


# --- signals ---------------------------------------------------------------------------

# (on ms, off ms) pairs, on the LED and the buzzer together.
READY = ((40, 60), (40, 60), (40, 0))
POURED = ((80, 0),)
BEVERAGE_SET = ((80, 80), (80, 0))
FAILED = ((600, 0),)


def signal(pattern):
    for on_ms, off_ms in pattern:
        _output(True)
        time.sleep_ms(on_ms)
        _output(False)
        time.sleep_ms(off_ms)


def _output(on):
    led.value(1 if on else 0)
    if buzzer is not None:
        buzzer.value((not on) if BUZZER_ACTIVE_LOW else on)


# --- the drink this spigot pours --------------------------------------------------------

def load_beverage():
    try:
        with open(STATE_FILE) as f:
            return json.load(f).get("beverage")
    except (OSError, ValueError):
        return None


def save_beverage(beverage):
    # Only ever called when the drink changes: flash does not love being rewritten.
    with open(STATE_FILE, "w") as f:
        json.dump({"beverage": beverage}, f)


# --- wifi -------------------------------------------------------------------------------

def set_country():
    # Without it the radio may stay off channels 12 and 13, which European routers use.
    country = getattr(config, "WIFI_COUNTRY", None)
    if not country:
        return
    try:
        network.country(country)
    except AttributeError:
        import rp2  # MicroPython before 1.21

        rp2.country(country)


def connect_wifi(watchdog=None):
    """Joins the wifi, blinking while it tries. False when it gave up this time round."""
    if wlan.isconnected():
        return True

    wlan.active(True)
    # Power saving lets the radio doze between packets; at a till that is lag for nothing.
    wlan.config(pm=getattr(network.WLAN, "PM_NONE", 0xA11140))
    wlan.connect(config.WIFI_SSID, config.WIFI_PASSWORD)

    deadline = time.ticks_add(time.ticks_ms(), WIFI_CONNECT_TIMEOUT_MS)
    while not wlan.isconnected():
        if watchdog:
            watchdog.feed()
        if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
            print("wifi: gave up, status", wlan.status())
            wlan.disconnect()
            return False
        led.toggle()
        time.sleep_ms(250)

    led.value(0)
    print("wifi: connected as", wlan.ifconfig()[0])
    return True


# --- the server -------------------------------------------------------------------------

def post(path, payload):
    url = "{}/api/bars/{}/spigots/{}".format(config.SERVER.rstrip("/"), config.BAR, path)
    response = requests.post(
        url,
        json=payload,
        headers={"Authorization": "Bearer " + config.SPIGOT_SECRET},
        timeout=HTTP_TIMEOUT_S,
    )
    try:
        if response.status_code != 200:
            raise RuntimeError("HTTP {} {}".format(response.status_code, response.text[:120]))
        return response.json()
    finally:
        response.close()


def handle_scan(uid, beverage):
    """Reports a card to the server. Returns the drink the spigot pours afterwards."""
    print("card", uid)
    try:
        reply = post("scan", {"spigot": config.SPIGOT_ID, "uid": uid, "beverage": beverage})
    except Exception as e:
        print("scan failed:", repr(e))
        signal(FAILED)
        return beverage

    if reply.get("result") == "beverage":
        drink = reply["beverage"]
        print("now pouring", drink["key"], "-", drink["name"])
        if drink["key"] != beverage:
            save_beverage(drink["key"])
        signal(BEVERAGE_SET)
        return drink["key"]

    if reply.get("result") == "pour" and reply.get("delivered", 0) > 0:
        signal(POURED)
    else:
        # No drink set yet, or no kiosk listening: either way nobody got this pour.
        print("not poured:", reply)
        signal(FAILED)
    return beverage


def say_hello(beverage, listeners):
    """The heartbeat. Returns how many kiosks are listening, as far as it could tell."""
    try:
        reply = post("hello", {"spigot": config.SPIGOT_ID, "beverage": beverage})
    except Exception as e:
        print("hello failed:", repr(e))
        return None

    if reply.get("listeners") != listeners:
        print("hello:", reply.get("listeners"), "kiosk(s) listening")
    return reply.get("listeners")


# --- the reader -------------------------------------------------------------------------

class Reader(MFRC522):
    """The driver, with its SPI primitives and its wait loop rebuilt.

    The driver frames each SPI byte as `b'%c' % n`, and current MicroPython encodes that
    as UTF-8 once n reaches 0x80 — two bytes on the wire. Every register read carries
    that bit, so reads land on the wrong register and the reader never sees a card.

    Its wait for a card's answer also ignores the chip's own timeout and spins through
    2000 register reads instead, about 300 ms whenever no card answers — so slow that a
    card lying on the reader went unseen for seconds at a time.
    """

    def _wreg(self, reg, val):
        self.cs.value(0)
        self.spi.write(bytes(((reg << 1) & 0x7E, val & 0xFF)))
        self.cs.value(1)

    def _rreg(self, reg):
        self.cs.value(0)
        self.spi.write(bytes((((reg << 1) & 0x7E) | 0x80,)))
        val = self.spi.read(1)
        self.cs.value(1)
        return val[0]

    def _tocard(self, cmd, send):
        """The driver's exchange with a card, ending as soon as the chip says it is over.

        Same contract as the original: (status, received bytes, received bits).
        """
        recv = []
        bits = n = 0
        stat = self.ERR
        irq_en, wait_irq = (0x12, 0x10) if cmd == 0x0E else (0x77, 0x30)

        self._wreg(0x02, irq_en | 0x80)
        self._wreg(0x04, 0x7F)  # clear every interrupt flag
        self._sflags(0x0A, 0x80)  # flush the FIFO
        self._wreg(0x01, 0x00)  # idle
        for c in send:
            self._wreg(0x09, c)
        self._wreg(0x01, cmd)
        if cmd == 0x0C:
            self._sflags(0x0D, 0x80)  # start sending

        # Done (RxIRq/IdleIRq), or the chip's timer ran out (TimerIRq, ~15 ms). The
        # deadline only guards against a chip that never says either.
        deadline = time.ticks_add(time.ticks_ms(), 40)
        while True:
            n = self._rreg(0x04)
            if n & (wait_irq | 0x01) or time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                break
        self._cflags(0x0D, 0x80)

        if n & (wait_irq | 0x01):
            if (self._rreg(0x06) & 0x1B) == 0x00:
                stat = self.OK
                # The timer firing only means "no card" when nothing was received.
                if n & irq_en & 0x01 and not n & 0x20:
                    stat = self.NOTAGERR
                elif cmd == 0x0C:
                    n = self._rreg(0x0A)
                    lbits = self._rreg(0x0C) & 0x07
                    bits = (n - 1) * 8 + lbits if lbits else n * 8
                    n = 1 if n == 0 else min(n, 16)
                    recv = [self._rreg(0x09) for _ in range(n)]
        return stat, recv, bits


def read_card(reader):
    """UID of a card in the field, as lowercase hex, or None."""
    status, _ = reader.request(reader.REQIDL)
    if status != reader.OK:
        return None
    status, uid = reader.SelectTagSN()
    if status != reader.OK:
        return None
    return "".join("{:02x}".format(b) for b in uid)


class _NoWatchdog:
    def feed(self):
        pass


def main():
    set_country()
    beverage = load_beverage()
    print("spigot", config.SPIGOT_ID, "of bar", config.BAR, "- pours", beverage)

    while not connect_wifi():
        signal(FAILED)
        time.sleep_ms(2000)

    # From here on, a hang of any kind — the radio, a socket, the reader — ends in a reboot
    # rather than a station that looks alive and is not. It cannot be switched off again,
    # which is why config.WATCHDOG exists for working under Thonny.
    watchdog = machine.WDT(timeout=WATCHDOG_MS) if getattr(config, "WATCHDOG", True) else _NoWatchdog()

    reader = Reader(sck=PIN_SCK, mosi=PIN_MOSI, miso=PIN_MISO, rst=PIN_RST, cs=PIN_CS, spi_id=0)
    reader.init()

    listeners = say_hello(beverage, None)
    signal(READY if listeners is not None else FAILED)

    now = time.ticks_ms()
    last_uid, last_seen = None, now
    last_hello, last_reset = now, now

    while True:
        watchdog.feed()

        if not wlan.isconnected():
            connect_wifi(watchdog)
            continue

        uid = read_card(reader)
        if uid:
            if uid != last_uid or time.ticks_diff(time.ticks_ms(), last_seen) > CARD_GONE_MS:
                beverage = handle_scan(uid, beverage)
                watchdog.feed()
            last_uid = uid
            # Taken after the scan, which may have spent seconds on the network: a card
            # still lying there is seen again at once and must not count as new.
            last_seen = time.ticks_ms()

        now = time.ticks_ms()

        if time.ticks_diff(now, last_hello) >= HELLO_INTERVAL_MS:
            last_hello = now
            card_present = time.ticks_diff(now, last_seen) < CARD_GONE_MS
            listeners = say_hello(beverage, listeners)
            # The hello takes longer than CARD_GONE_MS, and nothing polls meanwhile. A card
            # lying there before it is still there after, not a new tap.
            if card_present:
                last_seen = time.ticks_ms()

        if (time.ticks_diff(now, last_reset) >= READER_RESET_INTERVAL_MS
                and time.ticks_diff(now, last_seen) >= READER_RESET_IDLE_MS):
            last_reset = now
            reader.init()

        time.sleep_ms(50)


try:
    main()
except KeyboardInterrupt:
    # Stopped from Thonny or mpremote: leave the REPL to whoever stopped it.
    raise
except Exception as e:
    print("crashed:", repr(e))
    signal(FAILED)
    time.sleep_ms(1000)
    machine.reset()
