# Spigot stations (Pico W + RC522)

One NFC station at each tap. Tap a **drink's tag** on it and that spigot now pours that
drink. Tap a **member card** and the kiosk tablet shows who it is and what they're getting,
with two big buttons — *Malé 0,3 l* and *Velké 0,5 l*. The barman's press files an ordinary
order, which syncs like any other.

```
Pico (spigot 1..4) ── POST /api/bars/<bar>/spigots/scan|hello ──►  baroo on the RPi
                         Authorization: Bearer SPIGOT_SECRET          │ memory only, no PocketBase
Kiosk tablet ◄──────── SSE /api/bars/<bar>/spigots/events ────────────┘
   └ finds the member in its offline data → pour card → order in the outbox → sync
```

Nothing between the tap and the order needs PocketBase or the internet: the venue server
remembers which tags are drinks on its own disk, and the kiosk resolves members from its
offline snapshot, exactly as for any other reader.

## Parts, per spigot

- Raspberry Pi Pico W (RP2040 + CYW43439 wifi)
- RC522 / MFRC522 reader board, 13.56 MHz
- 8 jumper wires, female–female (or solder them)
- 5 V micro-USB power supply
- optional: a 3-pin buzzer *module* (one with its own transistor)
- one NFC tag per drink — any ISO 14443A tag: NTAG213 stickers, MIFARE fobs, the white card
  that comes with the RC522

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
  least 1 cm off the spigot or the tower, in a box that keeps beer off it.
- The RC522 only reads ISO 14443A cards (MIFARE Classic/Ultralight, NTAG, DESFire's UID).
  Phones and bank cards present a random UID every time and cannot be anyone's card.

## Flashing a station

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
   Only `SPIGOT_ID` differs between stations.
5. **Program.** Save `main.py` to the Pico. It starts on its own at every power-up.

Or, with [mpremote](https://docs.micropython.org/en/latest/reference/mpremote.html)
(`pip install mpremote`), from this folder:

```bash
mpremote mip install github:danjperron/micropython-mfrc522/mfrc522.py
mpremote cp config.py :config.py + cp main.py :main.py + reset
```

## Updating a station

After changing `config.py` or `main.py`, copy the file to the Pico again. Close anything
else using the Pico's COM port first: only one program can talk to it at a time.

**With Thonny:**

1. In the bottom-right corner, pick *MicroPython (Raspberry Pi Pico)* and the Pico's port.
2. Press the red **Stop** button. That interrupts the running station and gives you a `>>>`
   prompt.
3. Turn on *View → Files*. In the top pane (your computer), open this folder.
4. Right-click the file, choose **Upload to /**, and confirm overwriting it.
5. Restart the station: press **Ctrl+D** in the shell (soft reboot), or replug the USB.

Edit the files here, in the repo, and upload them. Thonny's *Save as → Raspberry Pi Pico*
changes only the Pico's copy, and the next upload from the repo would quietly undo it.

**With mpremote:** run from this folder. It copies the file and restarts the Pico in one
go, interrupting the station by itself. Swap `COM3` for the Pico's port:

```bash
mpremote connect COM3 cp config.py :config.py + reset
```

The same works for `main.py`, or for both at once with `+ cp main.py :main.py` before the
`+ reset`. To watch the station's console afterwards (Ctrl+] quits):

```bash
mpremote connect COM3 repl
```

## What the station says

| Signal (LED and buzzer) | Meaning |
|---|---|
| fast blinking | joining the wifi |
| 3 quick blinks | up, and the server answered |
| 1 short | pour sent — it's on the kiosk |
| 2 short | drink set: this spigot now pours the tag's drink |
| 1 long | it didn't go through — see the console, and *Troubleshooting* |

The console (Thonny's shell, or `mpremote`) prints every card's UID as it is read.

## Setting up a bar

**The server** (the RPi):

1. Set `SPIGOT_SECRET` in `.env` to the same value as the stations' `config.py`. Without it
   the feature is off.
2. Import `data/pb_schema.json` into PocketBase (*Settings → Import collections*, merge, do
   not wipe). It adds the `tagSerial` field to `bar_offer_items`.
3. Run it reachable from the wifi: `HOST=0.0.0.0 PORT=3000 node build`, under pm2 in
   **fork** mode — stations and kiosks meet in the server's memory, and `cluster` would
   split them between workers. If Caddy sits in front, allow `/api/bars/*/spigots/*`.
4. Give the RPi a fixed address (a DHCP reservation in the router). The stations' `SERVER`
   is an IP address.

**The drinks:**

1. Tap the drink's tag on any station. It gives a long beep (it's not a drink yet), and the
   kiosk shows *Neznámý štítek 04a1b2…* — that's its UID. The station's console prints it
   too.
2. Backstage → the bar → *Nabídka* → edit the drink → *NFC štítek nápoje* → paste → save.
3. On the kiosk: *Nástroje → Načíst data baru*. The venue server learns which tags are
   drinks from the kiosk's pull, so a newly mapped tag works after the next pull.
4. Tap the tag on a station: two beeps, and the kiosk says *Pípa 1 teď čepuje …*.

**The kiosk** gets its pass to the stations with its data: after `SPIGOT_SECRET` is set,
pull once, reload, and start it. The boot list gains a `spigots` row, and a strip under the
form shows each station, its drink, and a green dot while it is checking in.

## Trying it on dev

### Without a Pico

`npm run spigot-sim` acts like a station — it even remembers the drink a beverage tag gave it.

1. In `.env`: `SPIGOT_SECRET=dev` and `SPIGOT_SIM_BAR=<your bar's slug>`.
2. `npm run dev -- --host`, open the kiosk at `https://localhost:5173/bar/<slug>`, pull its
   data (staff console), reload, and start it.
3. Map a made-up tag such as `beef01` to a drink in backstage, then pull on the kiosk again.
4. Then:

```bash
npm run spigot-sim -- scan beef01
```

```bash
npm run spigot-sim -- scan <a member's card serial>
```

```bash
npm run spigot-sim -- scan <another member's serial> --spigot 2 --beverage <drink key>
```

The first sets spigot 1's drink, the second puts a pour card on the kiosk, the third a
second card from spigot 2. `hello` makes a station show up in the kiosk's strip without
scanning anything.

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
| `HTTP 401` | `SPIGOT_SECRET` differs between `config.py` and the server's `.env`. |
| `HTTP 503` | The server has no `SPIGOT_SECRET` set. |
| `HTTP 404` | Wrong `BAR` slug, or a server without this feature. |
| `OSError` / `ETIMEDOUT` / `ECONNREFUSED` | Wrong `SERVER`, the firewall, or the dev server started without `--host`. |
| `not poured: {'result': 'no-beverage'}` | Tap a drink's tag on this spigot first. |
| `not poured: {'result': 'pour', 'delivered': 0}` | No kiosk is listening. Open the kiosk and start it; its strip should list the station. |

On the kiosk, *Pípy nejsou připojené* means the tablet cannot reach the stream. Check that
it is opened from the venue server and has pulled since `SPIGOT_SECRET` was set.

If members' cards come up as unknown tags at the spigots but work on the tablet, compare
the UID the station prints with the one in backstage's mapper. Both read the bytes in the
same order, so a difference means the card hands out random UIDs.
