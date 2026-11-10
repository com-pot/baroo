"""
Baroo TapTapper (PípaPípač): a Raspberry Pi Pico W with an RC522 reader, one at each tap.

A package tag unseals a fresh package of its kind onto this tap. A member's card is an
offer of what the tap pours, waiting for a size: picked on the TapTapper's own size
buttons, or by the barman on the tablet. The TapTapper knows nothing on purpose and works
online only: the server says which tags are packages, who the card belongs to, what the
tap pours and how much of it is left, and files whatever happens as this tap — the token
in config.py, from baroo backstage, says which one.

With a display, it shows the drink on tap with what is left of it and, when someone taps,
their name and photo — screens the server draws (display.py).

Wiring, setup and what the beeps mean: README.md next to this file.
"""

import time

import machine
import network
import requests
from machine import Pin

import config
from mfrc522 import MFRC522
from palette import color_name

# RC522 on SPI0 — the wiring table in README.md.
PIN_SCK = 18
PIN_MOSI = 19
PIN_MISO = 16
PIN_CS = 17
PIN_RST = 22

# A card counts as new once it has been out of the field this long. A card lying on the
# reader is re-read every 150-200 ms (see Reader._tocard), so holding it never pours
# twice; lifting it away and tapping again pours again almost at once.
CARD_GONE_MS = 500
# The server calls a TapTapper gone after 60 s without hearing from it.
HELLO_INTERVAL_MS = 20000
# While an offer waits, the heartbeat asks after it this often: served on the tablet, or
# dismissed there, it is off the screen at once.
OFFER_POLL_MS = 1500
# An RC522 can go deaf after hours of polling. A soft reset is cheap, but it also wakes
# any card lying on the antenna — so only after the field has been empty a while.
READER_RESET_INTERVAL_MS = 60000
READER_RESET_IDLE_MS = 10000
HTTP_TIMEOUT_S = 5
WIFI_CONNECT_TIMEOUT_MS = 20000
# How long a scan's screen stays up when the server did not say.
SCREEN_HOLD_MS = 5000
# The RP2040 watchdog tops out at about 8.3 s; everything slow below stays under it.
WATCHDOG_MS = 8000

BUZZER_PIN = getattr(config, "BUZZER_PIN", None)
BUZZER_ACTIVE_LOW = getattr(config, "BUZZER_ACTIVE_LOW", False)

led = Pin("LED", Pin.OUT, value=0)
buzzer = None
if BUZZER_PIN is not None:
    buzzer = Pin(BUZZER_PIN, Pin.OUT, value=1 if BUZZER_ACTIVE_LOW else 0)

# The size buttons left to right, each between a pin and GND, so pressed reads 0. They
# answer the sizes the drink on tap comes in, in order: the first button the smallest.
buttons = [
    Pin(button["pin"], Pin.IN, Pin.PULL_UP)
    for button in (getattr(config, "BUTTONS", None) or [])
]

wlan = network.WLAN(network.STA_IF)

AUTH = {"Authorization": "Bearer " + config.TAP_TOKEN}


class NotAuthorized(Exception):
    """The server does not know this tap's token: revoked, run out, or never valid."""


# --- signals ---------------------------------------------------------------------------

# (on ms, off ms) pairs, on the LED and the buzzer together.
READY = ((40, 60), (40, 60), (40, 0))
POURED = ((80, 0),)
PACKAGE_SET = ((80, 80), (80, 0))
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
    url = "{}/api/bars/{}/taps/{}".format(config.SERVER.rstrip("/"), config.BAR, path)
    response = requests.post(url, json=payload, headers=AUTH, timeout=HTTP_TIMEOUT_S)
    try:
        if response.status_code == 401:
            raise NotAuthorized()
        if response.status_code != 200:
            raise RuntimeError("HTTP {} {}".format(response.status_code, response.text[:120]))
        return response.json()
    finally:
        response.close()


def handle_scan(uid):
    """Reports a card to the server. Returns its reply, or None when there was none."""
    print("card", uid)
    try:
        reply = post("scan", {"uid": uid})
    except Exception as e:
        print("scan failed:", repr(e))
        signal(FAILED)
        return None

    result = reply.get("result")
    if result == "package":
        unsealed = reply["package"]
        print("now pouring", unsealed["offerItemKey"], "-", unsealed["name"], unsealed["label"])
        signal(PACKAGE_SET)
    elif result == "offer" and answerable(reply):
        signal(POURED)
    else:
        # Nothing on this tap yet, an unknown card, or nobody to pick the size.
        print("not offered:", result, "- delivered to", reply.get("delivered"))
        signal(FAILED)
    return reply


def answerable(reply):
    """Whether somebody can pick the size of an offer: a kiosk, or these buttons."""
    return reply.get("delivered", 0) > 0 or bool(buttons and reply.get("variants"))


def handle_size(offer, variant):
    """Sends the size picked on the buttons for the offer waiting on them.

    Returns the server's reply, or None when there was none.
    """
    print("size", variant)
    try:
        reply = post("serve", {"offer": offer, "variant": variant})
    except Exception as e:
        print("serve failed:", repr(e))
        signal(FAILED)
        return None

    if reply.get("result") == "served":
        signal(POURED)
    else:
        # Dismissed on the tablet meanwhile.
        print("not served:", reply.get("result"))
        signal(FAILED)
    return reply


def say_hello(listeners, offer=None):
    """The heartbeat, asking after `offer` too when given.

    Returns the server's reply, or None when there was none.
    """
    payload = {"offer": offer} if offer else {}
    try:
        reply = post("hello", payload)
    except NotAuthorized:
        raise
    except Exception as e:
        print("hello failed:", repr(e))
        return None

    if reply.get("listeners") != listeners:
        print("hello:", reply.get("listeners"), "kiosk(s) listening")
    return reply


# --- the display ------------------------------------------------------------------------

class _NoDisplay:
    """Stands in for a TapTapper without a display, so nothing else has to ask."""

    def show_remote(self, url, headers, timeout):
        pass

    def message(self, lines, tone="normal"):
        pass


def open_display():
    if not getattr(config, "DISPLAY", False):
        return _NoDisplay()
    try:
        from display import Display

        return Display(madctl=getattr(config, "DISPLAY_MADCTL", 0x48))
    except Exception as e:
        # A missing display.py or a dead panel must not take the reader down with it.
        print("display failed:", repr(e))
        return _NoDisplay()


def show_screen(display, path):
    """Draws a screen the server rendered. False when it could not be had."""
    try:
        display.show_remote(config.SERVER.rstrip("/") + path, AUTH, HTTP_TIMEOUT_S)
        return True
    except Exception as e:
        print("screen failed:", repr(e))
        return False


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


def hello_or_halt(display, watchdog, listeners, offer=None):
    """The heartbeat, waiting out a revoked token: until a new config.py comes with the
    tap authorized again, there is nothing this TapTapper may do."""
    while True:
        try:
            return say_hello(listeners, offer)
        except NotAuthorized:
            print("not authorized: get a new config.py from baroo backstage")
            display.message(["Pipa neni", "autorizovana"], tone="error")
            signal(FAILED)
            # Fed while it waits: a revoked tap is not a hung one.
            for _ in range(HELLO_INTERVAL_MS // 1000):
                watchdog.feed()
                time.sleep_ms(1000)


class _NoWatchdog:
    def feed(self):
        pass


def main():
    set_country()
    print("tap of bar", config.BAR)
    for i, pin in enumerate(buttons):
        print("button", i + 1, color_name(config.BUTTONS[i]["color"]), "on", pin)

    display = open_display()
    # What the server calls this tap, once it has said so.
    label = "Pipa"
    display.message([label, "Pripojuji..."])

    while not connect_wifi():
        signal(FAILED)
        time.sleep_ms(2000)

    # From here on, a hang of any kind — the radio, a socket, the reader — ends in a reboot
    # rather than a TapTapper that looks alive and is not. It cannot be switched off again,
    # which is why config.WATCHDOG exists for working under Thonny.
    watchdog = machine.WDT(timeout=WATCHDOG_MS) if getattr(config, "WATCHDOG", True) else _NoWatchdog()

    reader = Reader(sck=PIN_SCK, mosi=PIN_MOSI, miso=PIN_MISO, rst=PIN_RST, cs=PIN_CS, spi_id=0)
    reader.init()

    reply = hello_or_halt(display, watchdog, None)
    listeners = reply.get("listeners") if reply else None
    label = (reply or {}).get("label") or label
    print("tap", label)
    signal(READY if reply else FAILED)

    # The idle screen's path as the server last gave it, and the one on the panel now —
    # None while something else is showing. A changed path means a changed screen.
    idle = reply.get("idle") if reply else None
    shown = None
    # When a scan's screen gives way to the idle screen again.
    idle_at = None
    # The offer the size buttons answer and the heartbeat asks after: its id and the sizes
    # the item on tap is offered in, which the buttons answer in order.
    waiting = None
    # The buttons down at the last look, so one held down counts once.
    held = set()

    now = time.ticks_ms()
    last_uid, last_seen = None, now
    last_hello, last_reset, last_poll = now, now, now

    def show_idle():
        nonlocal shown
        if idle and show_screen(display, idle):
            shown = idle
        else:
            display.message([label, "", "Server nedostupny"], tone="muted")
            shown = None

    def blocking(work):
        # Nothing polls the reader during `work`, which takes longer than CARD_GONE_MS:
        # a card lying there before it is still there after, not a new tap.
        nonlocal last_seen
        present = time.ticks_diff(time.ticks_ms(), last_seen) < CARD_GONE_MS
        result = work()
        watchdog.feed()
        if present:
            last_seen = time.ticks_ms()
        return result

    def show_reply(reply):
        # What the server answered stays up for its `hold` — or, with no answer, the
        # TapTapper's own word that the server is out of reach.
        nonlocal idle, shown, idle_at
        screen, drawn = None, False
        if reply:
            idle = reply.get("idle") or idle
            screen = reply.get("screen")
            if screen:
                drawn = show_screen(display, screen)
            hold = reply.get("hold", SCREEN_HOLD_MS)
        else:
            display.message(["Server", "nedostupny"], tone="error")
            hold = SCREEN_HOLD_MS
        watchdog.feed()
        if drawn and screen == idle:
            # Straight back to idle, which is up already.
            shown, idle_at = idle, None
        else:
            shown = None
            idle_at = time.ticks_add(time.ticks_ms(), hold)

    def pressed():
        # The index of the button that has just gone down, or None.
        nonlocal held
        down = set(i for i, pin in enumerate(buttons) if not pin.value())
        new = down - held
        held = down
        for i in new:
            return i
        return None

    blocking(show_idle)

    while True:
        watchdog.feed()

        if not wlan.isconnected():
            connect_wifi(watchdog)
            continue

        uid = read_card(reader)
        if uid:
            if uid != last_uid or time.ticks_diff(time.ticks_ms(), last_seen) > CARD_GONE_MS:
                reply = handle_scan(uid)
                watchdog.feed()
                show_reply(reply)
                # An offer waits while its screen is up, and only when somebody can pick
                # its size: a kiosk that heard of it, or the buttons here.
                waiting = None
                if reply and reply.get("offer") and answerable(reply):
                    waiting = {"id": reply["offer"], "variants": reply.get("variants") or []}
                    last_poll = time.ticks_ms()
            last_uid = uid
            # Taken after the scan, which may have spent seconds on the network: a card
            # still lying there is seen again at once and must not count as new.
            last_seen = time.ticks_ms()

        # Button i serves the item's i-th size; the buttons past its last size do nothing.
        button = pressed()
        if button is not None and waiting and button < len(waiting["variants"]):
            offer, waiting = waiting, None
            variant = offer["variants"][button]["key"]
            blocking(lambda: show_reply(handle_size(offer["id"], variant)))

        now = time.ticks_ms()

        if idle_at is not None and time.ticks_diff(now, idle_at) >= 0:
            idle_at = None
            waiting = None
            blocking(show_idle)

        if waiting and time.ticks_diff(now, last_poll) >= OFFER_POLL_MS:
            last_poll = now
            reply = blocking(lambda: hello_or_halt(display, watchdog, listeners, waiting["id"]))
            if reply:
                listeners = reply.get("listeners")
                idle = reply.get("idle") or idle
                # Served on the tablet — with what is left now — or dismissed there.
                if reply.get("offer"):
                    waiting = None
                    blocking(lambda: show_reply(reply["offer"]))

        if time.ticks_diff(now, last_hello) >= HELLO_INTERVAL_MS:
            last_hello = now
            reply = blocking(lambda: hello_or_halt(display, watchdog, listeners))
            if reply:
                listeners = reply.get("listeners")
                label = reply.get("label") or label
                idle = reply.get("idle") or idle
                # Back on the idle screen, and it changed — the gauge, say — or the server
                # is back after the TapTapper had to make do without it.
                if idle_at is None and idle != shown:
                    blocking(show_idle)

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
