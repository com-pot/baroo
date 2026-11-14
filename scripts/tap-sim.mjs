/**
 * Pretends to be a TapTapper, so the server side can be tried without a Pico.
 *
 *   npm run tap-sim -- scan <serial>
 *   npm run tap-sim -- serve <size>
 *   npm run tap-sim -- hello
 *
 * Like a real TapTapper it knows nothing of its own: the server says what the tap pours, and
 * which tap it is - by its token, from the config.py backstage hands out on authorizing it.
 * A scan that made an offer is remembered - per token, in node_modules/.cache - so
 * `serve 0_3` (or `0_5`) presses that size for it.
 *
 * `--out` saves what the TapTapper's display would show, as data/_sim/<date>-<view>.png: the
 * screen a scan or a serve produced, or the idle screen - after a hello, or a reply with no
 * screen of its own.
 *
 * The token, bar and server come from a config.py downloaded from backstage: by default
 * .config.sim.py next to this script, or the one `--config` names. `--token` (or
 * TAP_SIM_TOKEN in .env) stands in for a config without one.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = `usage: npm run tap-sim -- <scan <serial> | serve <size> | hello> [options]

  --config <config.py> token, bar and server from a config file from backstage
                       (default: .config.sim.py next to this script)
  --token <token>      the tap's token (default: the config's, or TAP_SIM_TOKEN)
  --out                save the TapTapper display's screen to data/_sim/<date>-<view>.png`;

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
        token: { type: 'string' },
        out: { type: 'boolean' },
    },
});

const configFile = flags.config ?? fileURLToPath(new URL('.config.sim.py', import.meta.url));
const config = await readConfig(configFile).catch((error) => {
    console.error(`cannot read ${configFile}: ${error.message}`);
    process.exit(2);
});
flags.url = config.SERVER;
flags.bar = config.BAR;
flags.token ??= config.TAP_TOKEN || process.env.TAP_SIM_TOKEN;

// The serial to scan, or the size to serve.
const [command, argument] = positionals;

if (!['scan', 'serve', 'hello'].includes(command) || (command !== 'hello' && !argument)) {
    console.error(USAGE);
    process.exit(2);
}
if (!flags.url || !flags.bar || !flags.token) {
    console.error(`${configFile} lacks SERVER, BAR or TAP_TOKEN`);
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
        body = { serial: argument };
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

if (flags.out) await saveScreen(reply.screen?.path ?? `/api/bars/${encodeURIComponent(flags.bar)}/taps/screen`);

/** Fetches a TapTapper screen and writes it out as a PNG, the way the display would show it. */
async function saveScreen(path) {
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

    // Sortable, and apart for screens saved within the same second
    const date = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
    const view = new URL(path, origin).searchParams.get('view') ?? 'idle';
    const file = fileURLToPath(new URL(`../data/_sim/${date}-${view}.png`, import.meta.url));
    await mkdir(dirname(file), { recursive: true });

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
        case 'error':
            switch (reply.error) {
                case 'no-offer':
                    return 'beeeeep — nothing on this tap: tap a package tag first';
                case 'package-open':
                    return 'beeeeep — the package is open elsewhere: flush it first';
                default:
                    return 'beeeeep — the TapTapper has no buttons for what the tap pours';
            }
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
