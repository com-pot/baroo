/**
 * Pretends to be a TapTapper, so the server side can be tried without a Pico.
 *
 *   npm run tap-sim -- scan <uid>
 *   npm run tap-sim -- serve <size>
 *   npm run tap-sim -- hello
 *
 * Like a real TapTapper it knows nothing of its own: the server says what the tap pours, and
 * which tap it is - by its token, from the config.py backstage hands out on authorizing it.
 * A scan that made an offer is remembered - per token, in node_modules/.cache - so
 * `serve 0_3` (or `0_5`) presses that size for it.
 *
 * `--out screen.png` saves what the TapTapper's display would show: the screen a scan or a
 * serve produced, or the idle screen a hello handed back.
 *
 * `--config config.py` takes the token, bar and server from a downloaded config file.
 * Otherwise TAP_SIM_TOKEN, TAP_SIM_URL and TAP_SIM_BAR from .env are the defaults for
 * --token, --url and --bar.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = `usage: npm run tap-sim -- <scan <uid> | serve <size> | hello> [options]

  --config <config.py> token, bar and server from a config file from backstage
  --bar <slug>         bar slug (default: TAP_SIM_BAR)
  --token <token>      the tap's token (default: TAP_SIM_TOKEN)
  --url <origin>       baroo server (default: TAP_SIM_URL or https://localhost:5173)
  --out <file.png>     save the TapTapper display's screen as a picture`;

try {
    process.loadEnvFile('.env');
} catch {
    // No .env — everything has to come from the environment or the flags.
}

const { values: flags, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        config: { type: 'string' },
        url: { type: 'string' },
        bar: { type: 'string' },
        token: { type: 'string' },
        out: { type: 'string' },
    },
});

const config = flags.config ? await readConfig(flags.config) : {};
flags.url ??= config.SERVER || process.env.TAP_SIM_URL || 'https://localhost:5173';
flags.bar ??= config.BAR || process.env.TAP_SIM_BAR;
flags.token ??= config.TAP_TOKEN || process.env.TAP_SIM_TOKEN;

// The uid to scan, or the size to serve.
const [command, argument] = positionals;

if (!['scan', 'serve', 'hello'].includes(command) || (command !== 'hello' && !argument) || !flags.bar || !flags.token) {
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
// Per tap, which only the token tells apart
const offerKey = `${flags.bar}/${flags.token.slice(-12)}/offer`;

let body;
switch (command) {
    case 'scan':
        body = { uid: argument };
        break;
    case 'serve': {
        const offer = memory[offerKey];
        if (!offer) {
            console.error('this tap has no offer to serve: scan a member card first');
            process.exit(1);
        }
        body = { offer, variant: argument };
        break;
    }
    default:
        body = {};
}

const response = await fetch(new URL(`/api/bars/${encodeURIComponent(flags.bar)}/taps/${command}`, origin), {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${flags.token}`,
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
if (command === 'serve') delete memory[offerKey];

if (command !== 'hello') {
    await mkdir(dirname(MEMORY_FILE), { recursive: true });
    await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

console.log(describe(reply));

if (flags.out) await saveScreen(reply.screen ?? reply.idle, flags.out);

/** Fetches a TapTapper screen and writes it out as a PNG, the way the display would show it. */
async function saveScreen(path, file) {
    const screen = await fetch(new URL(path, origin), { headers: { authorization: `Bearer ${flags.token}` } });
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
        return `hello from ${reply.label}`;
    }
    if (command === 'serve') {
        if (reply.result === 'gone') return 'beeeeep — the offer was forgotten: nothing served';
        return `beep — size ${argument} filed`;
    }

    switch (reply.result) {
        case 'package':
            return `beep beep — the tap now pours ${reply.package.name}, ${reply.package.label} (${reply.package.offerItemKey})`;
        case 'offer': {
            const sizes = reply.variants.map((variant) => `${variant.key} (${variant.label})`).join(', ');
            return `beep — offer waits on the buttons, sizes ${sizes}`;
        }
        case 'no-sizes':
            return 'beeeeep — the TapTapper has no buttons for what the tap pours';
        case 'no-offer':
            return 'beeeeep — nothing on this tap: tap a package tag first';
        case 'unknown-card':
            return `beeeeep — nobody has card ${argument}`;
        default:
            return JSON.stringify(reply);
    }
}

/** The plain `NAME = "value"` lines of a config.py */
async function readConfig(path) {
    const values = {};
    for (const line of (await readFile(path, 'utf8')).split('\n')) {
        const match = line.match(/^([A-Z_]+) = (".*")\s*$/);
        if (match) values[match[1]] = JSON.parse(match[2]);
    }
    return values;
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
