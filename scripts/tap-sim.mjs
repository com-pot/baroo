/**
 * Pretends to be a TapTapper, so the kiosk side can be tried without a Pico.
 *
 *   npm run tap-sim -- scan <uid> [--tap 1] [--buttons 0_5,0_3]
 *   npm run tap-sim -- serve <size> [--tap 1]
 *   npm run tap-sim -- hello [--tap 1] [--offer]
 *
 * Like a real TapTapper it knows nothing of its own: the server says what the tap pours.
 * A scan that made an offer is remembered - per bar and tap, in node_modules/.cache - so
 * `serve 0_3` (or `0_5`) presses that size for it, and `hello --offer` asks after it the way
 * a waiting TapTapper does.
 *
 * `--buttons` scans as a TapTapper with buttons for those sizes, `--buttons` alone for both.
 *
 * `--out screen.png` saves what the TapTapper's display would show: the screen a scan or a
 * serve produced, or the idle screen a hello handed back.
 *
 * Reads TAP_SECRET from .env, plus TAP_SIM_URL and TAP_SIM_BAR as the defaults for --url
 * and --bar.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = `usage: npm run tap-sim -- <scan <uid> | serve <size> | hello> [options]

  --bar <slug>         bar slug (default: TAP_SIM_BAR)
  --tap <id>           which tap to be at (default: 1)
  --buttons [sizes]    scan as a TapTapper with size buttons (default: 0_5,0_3)
  --offer              hello asking after the last offer, as a waiting TapTapper does
  --url <origin>       baroo server (default: TAP_SIM_URL or https://localhost:5173)
  --secret <secret>    (default: TAP_SECRET)
  --out <file.png>     save the TapTapper display's screen as a picture`;

const ALL_BUTTONS = '0_5,0_3';

try {
    process.loadEnvFile('.env');
} catch {
    // No .env — everything has to come from the environment or the flags.
}

// `--buttons` takes an optional value: alone it means both buttons.
const argv = process.argv.slice(2);
const buttonsAt = argv.indexOf('--buttons');
if (buttonsAt !== -1 && (argv[buttonsAt + 1] === undefined || argv[buttonsAt + 1].startsWith('--'))) {
    argv.splice(buttonsAt + 1, 0, ALL_BUTTONS);
}

const { values: flags, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
        url: { type: 'string', default: process.env.TAP_SIM_URL || 'https://localhost:5173' },
        bar: { type: 'string', default: process.env.TAP_SIM_BAR },
        tap: { type: 'string', default: '1' },
        buttons: { type: 'string' },
        offer: { type: 'boolean', default: false },
        secret: { type: 'string', default: process.env.TAP_SECRET },
        out: { type: 'string' },
    },
});

// The uid to scan, or the size to serve.
const [command, argument] = positionals;

if (!['scan', 'serve', 'hello'].includes(command) || (command !== 'hello' && !argument) || !flags.bar || !flags.secret) {
    console.error(USAGE);
    process.exit(2);
}

const origin = new URL(flags.url);

// The vite dev server's certificate is self-signed. Waived only for servers on this
// machine or the local network: this is a dev tool, not a client to aim anywhere else.
if (origin.protocol === 'https:' && isLocal(origin.hostname)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const MEMORY_FILE = 'node_modules/.cache/tap-sim.json';
const memory = await readFile(MEMORY_FILE, 'utf8').then(JSON.parse).catch(() => ({}));
const offerKey = `${flags.bar}/${flags.tap}/offer`;
const buttons = flags.buttons ? flags.buttons.split(',').filter(Boolean) : [];

let body;
switch (command) {
    case 'scan':
        body = { tap: flags.tap, uid: argument, buttons };
        break;
    case 'serve': {
        const offer = memory[offerKey];
        if (!offer) {
            console.error(`tap ${flags.tap} has no offer to serve: scan a member card first`);
            process.exit(1);
        }
        body = { tap: flags.tap, offer, size: argument };
        break;
    }
    default:
        body = { tap: flags.tap, buttons, ...(flags.offer && memory[offerKey] ? { offer: memory[offerKey] } : {}) };
}

const response = await fetch(new URL(`/api/bars/${encodeURIComponent(flags.bar)}/taps/${command}`, origin), {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${flags.secret}`,
    },
    body: JSON.stringify(body),
});

const text = await response.text();
if (!response.ok) {
    console.error(`${response.status} ${response.statusText}: ${text}`);
    process.exit(1);
}

const reply = JSON.parse(text);

// Like a TapTapper, a size answers only the last offer, and only once.
if (reply.result === 'offer') memory[offerKey] = reply.offer;
if (command === 'serve' || reply.offer?.state) delete memory[offerKey];

if (command !== 'hello' || flags.offer) {
    await mkdir(dirname(MEMORY_FILE), { recursive: true });
    await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

console.log(describe(reply));

if (flags.out) await saveScreen(reply.screen ?? reply.offer?.screen ?? reply.idle, flags.out);

/** Fetches a TapTapper screen and writes it out as a PNG, the way the display would show it. */
async function saveScreen(path, file) {
    const screen = await fetch(new URL(path, origin), { headers: { authorization: `Bearer ${flags.secret}` } });
    if (!screen.ok) {
        console.error(`screen ${path}: ${screen.status} ${await screen.text()}`);
        process.exit(1);
    }

    const [width, height] = screen.headers.get('x-screen').split(' ')[0].split('x').map(Number);
    const rgb565 = Buffer.from(await screen.arrayBuffer());

    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0, o = 0; i < rgb565.length; i += 2, o += 3) {
        const value = (rgb565[i] << 8) | rgb565[i + 1];
        rgb[o] = ((value >> 11) & 0x1f) << 3;
        rgb[o + 1] = ((value >> 5) & 0x3f) << 2;
        rgb[o + 2] = (value & 0x1f) << 3;
    }

    const { default: sharp } = await import('sharp');
    await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toFile(file);
    console.log(`screen saved to ${file}`);
}

/** What a real TapTapper would signal, in words. */
function describe(reply) {
    if (command === 'hello') {
        const offer = reply.offer ? ` — the offer is ${reply.offer.state}` : flags.offer ? ' — the offer still waits' : '';
        return `hello from tap ${flags.tap} — ${reply.listeners} kiosk(s) listening${offer}`;
    }
    if (command === 'serve') {
        if (reply.result === 'gone') return 'beeeeep — the offer was dismissed or forgotten: nothing served';
        return reply.delivered > 0
            ? `beep — size ${argument} sent to ${reply.delivered} kiosk(s)`
            : 'beeeeep — nobody listening: the size went nowhere';
    }

    switch (reply.result) {
        case 'package':
            return reply.staff > 0
                ? `beep beep — tap ${flags.tap} now pours ${reply.package.name}, ${reply.package.label} (${reply.package.offerItemKey})`
                : `beeeeep — no staff tablet listening: ${reply.package.name} not tapped`;
        case 'offer': {
            const sizes = reply.sizes.length ? `, buttons ${reply.sizes.join(' ')}` : '';
            return reply.delivered > 0
                ? `beep — offer sent to ${reply.delivered} kiosk(s)${sizes}`
                : 'beeeeep — nobody listening: no kiosk has this bar open with taps booted';
        }
        case 'no-offer':
            return `beeeeep — nothing on tap ${flags.tap}: tap a package tag first`;
        default:
            return JSON.stringify(reply);
    }
}

function isLocal(hostname) {
    return hostname === 'localhost'
        || hostname === '[::1]'
        || /\.(localhost|local|test)$/.test(hostname)
        || /^127\./.test(hostname)
        || /^10\./.test(hostname)
        || /^192\.168\./.test(hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}
