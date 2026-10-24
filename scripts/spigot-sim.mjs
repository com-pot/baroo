/**
 * Pretends to be a spigot station, so the kiosk side can be tried without a Pico.
 *
 *   npm run spigot-sim -- scan <uid> [--spigot 1] [--beverage <key>]
 *   npm run spigot-sim -- hello [--spigot 1] [--beverage <key>]
 *
 * Like a real station it remembers the drink a beverage tag gave it — per bar and spigot,
 * in node_modules/.cache — and sends it with every scan. `--beverage` overrides that.
 *
 * Reads SPIGOT_SECRET from .env, plus SPIGOT_SIM_URL and SPIGOT_SIM_BAR as the defaults
 * for --url and --bar.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = `usage: npm run spigot-sim -- <scan <uid> | hello> [options]

  --bar <slug>        bar slug (default: SPIGOT_SIM_BAR)
  --spigot <id>       which station to be (default: 1)
  --beverage <key>    drink to report instead of the remembered one
  --url <origin>      baroo server (default: SPIGOT_SIM_URL or https://localhost:5173)
  --secret <secret>   (default: SPIGOT_SECRET)`;

try {
    process.loadEnvFile('.env');
} catch {
    // No .env — everything has to come from the environment or the flags.
}

const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        url: { type: 'string', default: process.env.SPIGOT_SIM_URL || 'https://localhost:5173' },
        bar: { type: 'string', default: process.env.SPIGOT_SIM_BAR },
        spigot: { type: 'string', default: '1' },
        beverage: { type: 'string' },
        secret: { type: 'string', default: process.env.SPIGOT_SECRET },
    },
});

const [command, uid] = positionals;

if (!['scan', 'hello'].includes(command) || (command === 'scan' && !uid) || !flags.bar || !flags.secret) {
    console.error(USAGE);
    process.exit(2);
}

const origin = new URL(flags.url);

// The vite dev server's certificate is self-signed. Waived only for servers on this
// machine or the local network: this is a dev tool, not a client to aim anywhere else.
if (origin.protocol === 'https:' && isLocal(origin.hostname)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const MEMORY_FILE = 'node_modules/.cache/spigot-sim.json';
const memory = await readFile(MEMORY_FILE, 'utf8').then(JSON.parse).catch(() => ({}));
const memoryKey = `${flags.bar}/${flags.spigot}`;
const beverage = flags.beverage ?? memory[memoryKey] ?? null;

const body = command === 'scan'
    ? { spigot: flags.spigot, uid, beverage }
    : { spigot: flags.spigot, beverage };

const response = await fetch(new URL(`/api/bars/${encodeURIComponent(flags.bar)}/spigots/${command}`, origin), {
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

if (reply.result === 'beverage') {
    memory[memoryKey] = reply.beverage.key;
    await mkdir(dirname(MEMORY_FILE), { recursive: true });
    await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

console.log(describe(reply));

/** What a real station would signal, in words. */
function describe(reply) {
    if (command === 'hello') return `hello from spigot ${flags.spigot} — ${reply.listeners} kiosk(s) listening`;

    switch (reply.result) {
        case 'beverage':
            return `beep beep — spigot ${flags.spigot} now pours ${reply.beverage.name} (${reply.beverage.key})`;
        case 'pour':
            return reply.delivered > 0
                ? `beep — pour of ${beverage} sent to ${reply.delivered} kiosk(s)`
                : 'beeeeep — nobody listening: no kiosk has this bar open with spigots booted';
        case 'no-beverage':
            return `beeeeep — spigot ${flags.spigot} has no drink yet: scan a beverage tag first (or pass --beverage)`;
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
