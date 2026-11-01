# TapTappers (PípaPípač, Pico W + RC522)

A **tap** is a line at the bar — *Pípa 1*, *Pípa 2* — pouring whatever was last unsealed
onto it. A **TapTapper** is the NFC station mounted at a tap. Tap a **package tag** on it
(*Plzeň, sud 50 l*) and a fresh package of that kind is on the tap: no form, no typing.
Tap a **member card** and the kiosk tablet shows who it is and what the tap pours, with a
big button for each size the drink is offered in. The barman's press — or the customer's,
on the TapTapper's own buttons — files an ordinary order, which syncs like any other. A
TapTapper with a display shows the drink on tap with a gauge of what is left of it, and
the customer's name and photo when they tap.

```
Pico (tap 1..4) ── POST /api/bars/<bar>/taps/scan|serve|hello ──►  baroo on the RPi
                     Authorization: Bearer TAP_SECRET                 │ disk + memory, no PocketBase
Kiosk tablet ◄──── SSE /api/bars/<bar>/taps/events ───────────────────┤
   ├ finds the member in its offline data → pending offer → order in the outbox → sync
   └ POST /api/bars/<bar>/taps/ops|dismiss: what it filed, so the taps know before any sync
```

Nothing between the tap and the order needs PocketBase or the internet: the venue server
keeps on its own disk which tags are packages, what is on each tap and how much of it is
left, and the kiosk resolves members from its offline snapshot, exactly as for any other
reader. For the displays the server also keeps the drinks' and members' names and pictures
on disk, learned from the kiosks' data pulls, and draws every screen itself; the TapTapper
only streams the pixels to its panel. It never works anything out itself — not even what
is left on its tap.

## How much is left

The venue server reckons each tap from what PocketBase knew at the latest data pull, plus
everything it heard of since: pours served at the TapTappers, packages tapped on, and the
orders, unseals and flushes the kiosks report the moment they file them. Once a pull brings
the same thing from PocketBase, the server's own note of it goes. A TapTapper gets the
numbers in the screens the server hands it — after each serve, and with every heartbeat —
so one without buttons, whose orders all come from the tablet, is never more than a
heartbeat behind; while an offer waits on it, it asks every 1.5 s.

Stock is per offer item: two kegs of the same beer on two taps share one gauge.

## Parts, per tap

- Raspberry Pi Pico W (RP2040 + CYW43439 wifi)
- RC522 / MFRC522 reader board, 13.56 MHz
- 8 jumper wires, female–female (or solder them)
- 5 V micro-USB power supply
- optional: a 3-pin buzzer *module* (one with its own transistor)
- optional: a 2.8" 240×320 SPI TFT with an ILI9341 controller — the common red module with
  touch and an SD slot, 9 more wires
- optional: a 2-key membrane keypad, red and yellow, to pick the size at the TapTapper
- one NFC tag per package kind (*Plzeň, sud 50 l*; *Kofola, sud 30 l*) — any ISO 14443A
  tag: NTAG213 stickers, MIFARE fobs, the white card that comes with the RC522

## Wiring

RC522 on SPI0. Pin numbers are the physical pins on the Pico's edge, counted
anticlockwise from pin 1 by the USB socket.

| RC522 | Pico W | Pin |
|---|---|---|
| SDA (SS) | GP17 | 22 |
| SCK | GP18 | 24 |
| MOSI | GP19 | 25 |
| MISO | GP16 | 21 |
| IRQ | — not connected | |
| GND | GND | 23 (or 38) |
| RST | GP22 | 29 |
| 3.3V | **3V3(OUT)** | 36 |
| *buzzer module* I/O · GND · VCC | GP15 · GND · 3V3(OUT) | 20 · 18 · 36 |

- **The RC522 runs on 3.3 V.** Never wire it to VBUS or VSYS (pins 40/39, 5 V).
- A bare buzzer draws more than a GPIO pin should give (about 12 mA). Use a module with a
  transistor on board, or add an NPN transistor with a 1 kΩ base resistor. Modules that
  sound while their input is LOW need `BUZZER_ACTIVE_LOW = True`.
- Keep the SPI wires short — under 20 cm. The Pico is wireless, so mount it right next to
  the reader rather than running long wires to it.
- The antenna reads 2–4 cm and dies against metal. Mount the reader on a plastic plate at
  least 1 cm off the tap or the tower, in a box that keeps beer off it.
- The RC522 only reads ISO 14443A cards (MIFARE Classic/Ultralight, NTAG, DESFire's UID).
  Phones and bank cards present a random UID every time and cannot be anyone's card.

## Display

The 2.8" ILI9341 module gets its own SPI bus (SPI1): the reader runs at 1 MHz, the display
at 40 MHz, and sharing a bus would slow the display down. None of these pins clash with
the reader or the buzzer.

| Display | Pico W | Pin |
|---|---|---|
| VCC | VBUS (5 V) | 40 |
| GND | GND | 28 |
| CS | GP13 | 17 |
| RESET | GP9 | 12 |
| DC | GP8 | 11 |
| SDI (MOSI) | GP11 | 15 |
| SCK | GP10 | 14 |
| LED | GP14 | 19 |
| SDO (MISO) | — not connected | |
| T_CLK · T_DIN · T_DO · T_CS · T_IRQ | *(touch, unused for now)* GP10 · GP11 · GP12 · GP7 · GP6 | 14 · 15 · 16 · 10 · 9 |

- **VCC from VBUS (5 V)**: the backlight draws 50–80 mA, and the module's own regulator
  keeps that off the Pico's 3.3 V supply, which already feeds the wifi and the reader.
  Leave the solder jumper **J1 open**. Bridge it only to feed the module 3.3 V — and never
  feed 5 V with it bridged.
- **LED → GP14** lets the TapTapper switch the backlight. That assumes the board drives the
  backlight through a small transistor (a 3-pin part, usually *Q1*). Without one, wire LED
  to 3V3(OUT), pin 36, for always-on instead.
- **SDO** stays unconnected: nothing reads the panel, and on these modules it fights the
  touch chip over a shared MISO.
- Set `DISPLAY = True` in `config.py` and copy `display.py` to the Pico.
- Red and blue swapped: `DISPLAY_MADCTL = 0x40`. Upside down: `0x88`. Mirrored: `0x08`.

The display shows the drink on tap and a gauge of what is left of the package — green, amber
below a fifth, red when it is gone — until someone taps; then their name and photo, or the
package just tapped on, or what went wrong. The screens come from the venue server,
compressed to a few KB each, and the TapTapper redraws only when one changes. When the
server cannot be reached, the TapTapper falls back to plain text of its own.

## Size buttons

A 2-key membrane keypad (red and yellow) lets the customer pick the size at the TapTapper:
tap the card, then press **yellow for Malé, red for Velké** while the screen shows them.
Only the sizes the drink on tap is offered in (has a price for) show, and only those
buttons answer — a drink sold only as *Velké* shows just the red one. The kiosk files it
exactly as if the barman had pressed that size on the tablet — the offer there disappears,
and the display says *✓ Malé 0.3l* over what is left on the tap now. No press within 15 s,
and the offer waits on the tablet as before; served there, the display shows that too.

| Keypad | Pico W | Pin |
|---|---|---|
| red (Velké) | GP0 | 1 |
| yellow (Malé) | GP1 | 2 |
| shared contact | GND | 3 |

- Set `SIZE_BUTTONS = {"0_3": 1, "0_5": 0}` in `config.py` — serving → GPIO, so any free
  pins will do. A TapTapper without the keypad leaves it out: the screen then tells the
  customer to pick on the tablet.
- The Pico's own pull-ups do the rest — no resistors, no power wire.
- The tail's tabs fit a 3-pin 2.54 mm female header, or male header pins and the usual
  jumper wires. **Do not solder to the tail**: its tracks are printed silver ink.
- The shared contact is the track that reaches both buttons — usually the outer one, but
  keypads differ. Wired wrong, a button does nothing or reads as the other one, and
  nothing gets damaged. A colour that reads as the wrong size: swap the two numbers in
  `SIZE_BUTTONS`.

## Enclosure

`enclosure/station.scad` is a box for one TapTapper: the display on top, a *tap here* mark
below it with the reader right behind the front wall, the Pico inside, and a stand that
holds it on the counter, leaning back 15°. The size buttons' keypad lies flat on a step
at the front of the stand. The STL files next to it are ready to print:

| File | Lies on the bed | |
|---|---|---|
| `station-fit_test.stl` | front down | Only the front 12 mm. Print it first: it checks the window and how the boards snap in. |
| `station-shell.stl` | front down | |
| `station-lid.stl` | outside down | |
| `station-stand.stl` | as it comes | |

PLA or PETG, 0.2 mm layers, no supports. The box takes four M3 × 10 screws, self-tapping or
ordinary ones, which cut their own thread in the plastic.

1. **Display:** glass first into the top pocket, pin header down, until the tabs along its
   long edges click over the board.
2. **Reader:** parts side to the front, pin header up, onto its two ledges until it clicks.
3. **Pico:** upside down onto the lid's four pins, its USB socket at the hole in the side
   wall. A dab of hot glue keeps it there. A buzzer can be glued behind the lid's grille.
4. **Keypad tail,** before the jumpers go on its tabs: from the slot beside the stand's
   keypad pocket, down into the channel under the stand — turning it a quarter on the way,
   from lying across to lying along — and up out of the stand's floor. Then in through the
   hole in the box's floor, next to the reader.
5. Plug in the wires and screw the lid on. Push the box into the stand, drawing the tail's
   slack back out at the keypad end, and only then peel the keypad's backing and stick it
   into its pocket, red on the left.

If the picture comes out upside down, set `DISPLAY_MADCTL = 0x88`.

The boards' sizes come from their usual drawings and photos, not from calipers. If
something doesn't fit, open `station.scad` in [OpenSCAD](https://openscad.org), change the
number under *Window → Customizer*, render (F6) and export the STL (F7). The likely ones:

- `display_stack`, from the front of the glass to the back of the board. A display that
  rattles wants foam tape around the window, or a smaller number.
- `display_view_offset`, if the window sits off the picture.
- `inner_depth`, 24 instead of 38 with the wires soldered instead of Dupont plugs.
- `usb_side`, for the cable to leave on the other side.
- `keypad = false` for a TapTapper without size buttons: no step, no holes for the tail.

From a terminal, each part is `openscad -D 'part="shell"' -o station-shell.stl station.scad`.

## Flashing a TapTapper

1. **MicroPython.** Download the `RPI_PICO_W` firmware (`.uf2`, 1.24 or newer) from
   <https://micropython.org/download/RPI_PICO_W/>. Hold BOOTSEL while plugging the Pico in,
   and drop the file onto the `RPI-RP2` drive that appears.
2. **Thonny.** Install <https://thonny.org>, then *Tools → Options → Interpreter →
   MicroPython (Raspberry Pi Pico)*.
3. **Reader driver.** Open
   <https://github.com/danjperron/micropython-mfrc522/blob/master/mfrc522.py> and save it to
   the Pico as `/lib/mfrc522.py` (*File → Save as → Raspberry Pi Pico*, create the `lib`
   folder).
4. **Config.** Copy `config.example.py` to `config.py`, fill it in, and save it to the Pico.
   Only `TAP_ID` differs between TapTappers.
5. **Program.** Save `main.py` to the Pico — and `display.py` too, for a TapTapper with a
   display. `main.py` starts on its own at every power-up.

Or, with [mpremote](https://docs.micropython.org/en/latest/reference/mpremote.html)
(`pip install mpremote`), from this folder:

```bash
mpremote mip install github:danjperron/micropython-mfrc522/mfrc522.py
mpremote cp config.py :config.py + cp main.py :main.py + cp display.py :display.py + reset
```

## Updating a TapTapper

After changing `config.py`, `main.py` or `display.py`, copy the file to the Pico again.
Close anything else using the Pico's COM port first: only one program can talk to it at a
time. A TapTapper from before taps were called taps needs all three files again, and its
`config.py` the new names: `TAP_ID` and `TAP_SECRET` for `SPIGOT_ID` and `SPIGOT_SECRET`.

**With Thonny:**

1. In the bottom-right corner, pick *MicroPython (Raspberry Pi Pico)* and the Pico's port.
2. Press the red **Stop** button. That interrupts the running TapTapper and gives you a
   `>>>` prompt.
3. Turn on *View → Files*. In the top pane (your computer), open this folder.
4. Right-click the file, choose **Upload to /**, and confirm overwriting it.
5. Restart the TapTapper: press **Ctrl+D** in the shell (soft reboot), or replug the USB.

Edit the files here, in the repo, and upload them. Thonny's *Save as → Raspberry Pi Pico*
changes only the Pico's copy, and the next upload from the repo would quietly undo it.

**With mpremote:** run from this folder. It copies the file and restarts the Pico in one
go, interrupting the TapTapper by itself. Swap `COM3` for the Pico's port:

```bash
mpremote connect COM3 cp config.py :config.py + reset
```

The same works for the other files, or for several at once with more `+ cp …` before the
`+ reset`. To watch the TapTapper's console afterwards (Ctrl+] quits):

```bash
mpremote connect COM3 repl
```

## What the TapTapper says

| Signal (LED and buzzer) | Meaning |
|---|---|
| fast blinking | joining the wifi |
| 3 quick blinks | up, and the server answered |
| 1 short | offer sent — it's on the kiosk; again for a size pressed on the buttons |
| 2 short | package tapped on: this tap now pours a fresh package of the tag's kind |
| 1 long | it didn't go through — see the console, and *Troubleshooting* |

The console (Thonny's shell, or `mpremote`) prints every card's UID as it is read.

## Setting up a bar

**The server** (the RPi):

1. Set `TAP_SECRET` in `.env` to the same value as the TapTappers' `config.py`. Without it
   the feature is off.
2. Import `data/pb_schema.json` into PocketBase (*Settings → Import collections*, merge, do
   not wipe). It adds the `bar_offer_packages` collection.
3. Run it reachable from the wifi: `HOST=0.0.0.0 PORT=3000 node build`, under pm2 in
   **fork** mode — TapTappers and kiosks meet in the server's memory, and `cluster` would
   split them between workers. If Caddy sits in front, allow `/api/bars/*/taps/*`.
4. Give the RPi a fixed address (a DHCP reservation in the router). The TapTappers'
   `SERVER` is an IP address.
5. For the displays, the RPi needs a font to draw the screens' text with:
   `sudo apt install fonts-dejavu-core`. Names and photos reach the server with the kiosk's
   data pulls, like the package tags — a card handed out on the tablet shows by name at the
   taps after the next pull, and as *Ahoj!* until then.

**The packages:**

1. Tap the package's tag on any TapTapper. It gives a long beep (it's not a package yet),
   and the kiosk shows *Neznámý štítek 04a1b2…* — that's its UID. The TapTapper's console
   prints it too.
2. Backstage → the bar → *Nabídka* → *Balení* → *Přidat balení*: the item, what the
   package holds (50, in litres for a drink on tap), a label such as *Sud*, and the UID as
   its *NFC štítek balení* → save. One tag per package kind, not per keg: the same tag
   taps on every 50 l keg of Plzeň.
3. On the kiosk: *Nástroje → Načíst data baru*. The venue server learns which tags are
   packages from the kiosk's pull, so a newly registered tag works after the next pull.
4. Tap the tag on a TapTapper: two beeps, and the kiosk says *Pípa 1: naraženo …*. A staff
   kiosk (*Pokladna*) must be listening — it is what files the unseal. Tapping the tag
   again before anything got poured is still the same package.

**The taps** exist once something is unsealed onto them. Besides a package tag, the staff
kiosk's *Otevřít nové balení* and backstage's *Otevřít balení* pick the tap — or *Nová
pípa…* for one nobody used yet, a tap without a TapTapper included. *Dočerpat současné
balení*, ticked by default, closes what was left of the item's previous package and keeps
its stats; unticked, the new package adds to what is left. *Dočerpat balení* on a tap or an
item closes it without a new one.

**The kiosk** gets its pass to the TapTappers with its data: after `TAP_SECRET` is set,
pull once, reload, and start it. The boot list gains a `taps` row, and the *Pípy* board
shows each tap, what it pours, how much is left, and a green dot while its TapTapper is
checking in.

## Trying it on dev

### Without a Pico

`npm run tap-sim` acts like a TapTapper — and, like one, asks the server what its tap pours.

1. In `.env`: `TAP_SECRET=dev` and `TAP_SIM_BAR=<your bar's slug>`.
2. `npm run dev -- --host`, open the kiosk at `https://localhost:5173/bar/<slug>` on a
   staff device, pull its data (staff console), reload, and start it.
3. Register a package with a made-up tag such as `beef01` in backstage, then pull on the
   kiosk again.
4. Then:

```bash
npm run tap-sim -- scan beef01
```

```bash
npm run tap-sim -- scan <a member's card serial> --buttons
```

```bash
npm run tap-sim -- serve 0_5
```

The first taps the package onto tap 1, the second puts an offer on the kiosk, the third
presses red for it. `--tap 2` is another tap; `hello` makes a TapTapper show up on the
kiosk's board without scanning anything, and `hello --offer` asks after the last offer as
a waiting TapTapper does. Add `--out screen.png` to any of them to see what the display
would show.

### With a Pico on the desk

1. In `config.py`: `SERVER = "https://<your PC's LAN IP>:5173"` and `WATCHDOG = False`.
2. Start the dev server with `npm run dev -- --host`, so it listens on the network.
3. Let the Pico through Windows Firewall — in an administrator PowerShell, with the wifi
   set to a *Private* network:

```powershell
New-NetFirewallRule -DisplayName "baroo dev server" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
```

4. Run `main.py` from Thonny and watch its console while tapping cards.

## Troubleshooting

| Console says | What to do |
|---|---|
| nothing when a card is tapped | The reader is not answering: check 3.3 V, GND, SDA → GP17, RST → GP22. |
| `wifi: gave up` | The Pico W only does 2.4 GHz. Check SSID, password and `WIFI_COUNTRY`. |
| `HTTP 401` | `TAP_SECRET` differs between `config.py` and the server's `.env`. |
| `HTTP 503` | The server has no `TAP_SECRET` set. |
| `HTTP 404` | Wrong `BAR` slug, or a server without this feature — or one from before taps were called taps. |
| `OSError` / `ETIMEDOUT` / `ECONNREFUSED` | Wrong `SERVER`, the firewall, or the dev server started without `--host`. |
| `not offered: no-offer …` | Nothing is on this tap: tap a package tag on it first. |
| `not offered: offer - delivered to 0` | No kiosk is listening. Open the kiosk and start it; its *Pípy* board should list the tap. |
| `package not tapped: no staff tablet listening` | Only a staff kiosk (*Pokladna*) files packages: open one and start it. |
| `not served: gone …` | The offer was dismissed on the tablet before the button press. |
| `display failed: …` | `display.py` is missing on the Pico, or the panel is not answering. The TapTapper carries on without it. |
| `screen failed: …` | A screen could not be fetched; the TapTapper shows plain text instead. Same causes as the HTTP rows above. |

A display that stays white has power but no data: check CS, DC, RESET, SCK and SDI. One that
stays dark: check LED (or wire it to 3.3 V).

On the kiosk, *Pípy nejsou připojené* means the tablet cannot reach the stream. Check that
it is opened from the venue server and has pulled since `TAP_SECRET` was set.

If members' cards come up as unknown tags at the taps but work on the tablet, compare
the UID the TapTapper prints with the one in backstage's mapper. Both read the bytes in the
same order, so a difference means the card hands out random UIDs.
