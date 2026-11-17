<script lang="ts">
    import { onMount, tick } from "svelte";
    import { MicroPythonRepl } from "$lib/serial/microPythonRepl";
    import { serialPortFilters, serialPortId, serialPortVendor } from "$lib/serial/platform";

    /** Keeps a long session from eating the tab */
    const LOG_LIMIT = 200_000;

    /** The config with its secrets masked, the wifi's state and the networks around */
    const INSPECT = `
import config, network
for name in dir(config):
    if name.startswith('_'):
        continue
    value = getattr(config, name)
    print(name, '=', '<%d chars>' % len(value) if name in ('WIFI_PASSWORD', 'TAP_TOKEN') else repr(value))
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
print('wifi status', wlan.status(), wlan.ifconfig() if wlan.isconnected() else '')
print('networks', [(found[0].decode(), found[3]) for found in wlan.scan()])
`;

    const WIFI_STATUSES: [number, string][] = [
        [-3, "wrong password"],
        [-2, "network not found (check the SSID, case and diacritics included)"],
        [-1, "connection failed"],
        [0, "idle"],
        [1, "connecting"],
        [2, "connected, no IP yet"],
        [3, "connected"],
    ];

    let serial = $state<Serial | null>(null);
    let ports = $state.raw<SerialPort[]>([]);

    let repl = $state.raw<MicroPythonRepl | null>(null);
    /** The port to pick up again when it comes back - a reset re-plugs it */
    let following = $state.raw<SerialPort | null>(null);
    let busy = $state(false);
    let log = $state("");
    let line = $state("");
    let error = $state<string | null>(null);

    let output = $state<HTMLPreElement>();
    let stickToBottom = $state(true);

    onMount(() => {
        serial = navigator.serial ?? null;
        if (!serial) return;

        const refresh = async () => (ports = await serial!.getPorts());
        const onConnect = async (event: Event) => {
            await refresh();
            const port = event.target as SerialPort;
            if (!repl && following && serialPortId(port) === serialPortId(following)) attach(port);
        };
        refresh();
        serial.addEventListener("connect", onConnect);
        serial.addEventListener("disconnect", refresh);
        return () => {
            serial?.removeEventListener("connect", onConnect);
            serial?.removeEventListener("disconnect", refresh);
            detach();
        };
    });

    async function pick() {
        try {
            const port = await serial!.requestPort({ filters: serialPortFilters });
            if (!ports.includes(port)) ports = [...ports, port];
            attach(port);
        } catch {
            // Nothing picked
        }
    }

    async function attach(port: SerialPort) {
        await detach();
        error = null;

        try {
            repl = await MicroPythonRepl.open(port, { onOutput: append });
        } catch (err) {
            error = `Could not open the port: ${err instanceof Error ? err.message : err}. Is Thonny, mpremote or another tab using it?`;
            return;
        }

        const attached = repl;
        following = port;
        append(`\n--- attached ${serialPortId(port)} ---\n`);

        await attached.closed;
        if (repl !== attached) return;
        repl = null;
        await attached.close();
        append(`\n--- detached${following ? ", waiting for it to come back" : ""} ---\n`);
    }

    async function detach() {
        following = null;
        await repl?.close();
    }

    /** Fails into the error line, the console goes on */
    async function attempt(work: (repl: MicroPythonRepl) => Promise<unknown>) {
        if (!repl || busy) return;
        busy = true;
        error = null;

        try {
            await work(repl);
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            busy = false;
        }
    }

    /** Looks at what the program left, then restarts it - its watchdog wouldn't wait anyway */
    function inspect() {
        return attempt(async (repl) => {
            append("\n--- inspecting ---\n");
            await repl.enterRawRepl({ softReset: false });
            await repl.holdWatchdog();
            append(await repl.exec(INSPECT, 20_000));
            append("--- restarting ---\n");
            await repl.hardReset();
        });
    }

    async function append(text: string) {
        // The REPL's line editing escapes say nothing here
        log = (log + text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")).slice(-LOG_LIMIT);
        if (!stickToBottom || !output) return;
        await tick();
        output.scrollTop = output.scrollHeight;
    }

    function onScroll() {
        if (!output) return;
        stickToBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 24;
    }
</script>

<main class="container">
    <h1>Serial debug view</h1>
    <p class="hint">
        A MicroPython device's console over Web Serial (Chrome, Edge). Attaching only listens; the
        buttons interrupt the program. With the watchdog on, a TapTapper reboots about 8 s after
        an interrupt, which shows its boot log here too.
    </p>

    {#if !serial}
        <p class="alert alert-warning">This browser has no Web Serial.</p>
    {:else}
        <div class="toolbar">
            {#each ports as port, i (port)}
                {@const current = repl?.port === port}
                <button type="button" class="btn btn-sm" class:btn-primary={current} class:btn-outline-primary={!current}
                    onclick={() => current ? detach() : attach(port)}
                >
                    #{i + 1} {serialPortVendor(port)} {serialPortId(port)}{current ? " (detach)" : ""}
                </button>
            {/each}
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick={pick}>Add a device…</button>
            {#if following && !repl}
                <span class="hint">Waiting for {serialPortId(following)}…</span>
            {/if}
        </div>

        {#if error}
            <p class="alert alert-danger">{error}</p>
        {/if}

        <div class="toolbar">
            <button type="button" class="btn btn-sm btn-outline-secondary" disabled={!repl || busy} onclick={() => attempt((repl) => repl.send("\x03"))}>Interrupt (Ctrl+C)</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" disabled={!repl || busy} onclick={() => attempt((repl) => repl.send("\x04"))}>Soft reboot (Ctrl+D)</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" disabled={!repl || busy} onclick={() => attempt((repl) => repl.hardReset())}>Hard reset</button>
            <button type="button" class="btn btn-sm btn-outline-primary" disabled={!repl || busy} onclick={inspect}>Inspect config and wifi</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick={() => (log = "")}>Clear</button>
        </div>

        <pre class="console" bind:this={output} onscroll={onScroll}>{log}</pre>

        <form class="repl-line" onsubmit={(event) => { event.preventDefault(); attempt((repl) => repl.send(`${line}\r`)); line = ""; }}>
            <input class="form-control font-monospace" bind:value={line} disabled={!repl || busy}
                placeholder="A line for the REPL, after an interrupt" autocomplete="off" spellcheck="false"
            />
            <button type="submit" class="btn btn-primary" disabled={!repl || busy}>Send</button>
        </form>

        <details>
            <summary>Wifi statuses</summary>
            <ul>
                {#each WIFI_STATUSES as [status, meaning] (status)}
                    <li><code>{status}</code> {meaning}</li>
                {/each}
            </ul>
        </details>
    {/if}
</main>

<style lang="scss">
    .hint {
        color: var(--bs-secondary-color);
    }

    .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    .console {
        height: 60vh;
        overflow-y: auto;
        padding: 0.75rem;
        background: #111;
        color: #ddd;
        border-radius: var(--bs-border-radius);
        white-space: pre-wrap;
        word-break: break-all;
    }

    .repl-line {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
</style>
