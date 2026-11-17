import { MicroPythonRepl } from '$lib/serial/microPythonRepl';
import type { TapRuntime } from './models/tapModel';

export type TapUploadStep =
    | { step: 'connecting' }
    | { step: 'file'; path: string; done: number; total: number }
    | { step: 'restarting' };

export class MissingPrerequisites extends Error {
    constructor(public readonly paths: string[]) {
        super(`missing on the device: ${paths.join(', ')}`);
    }
}

/**
 * Uploads the tap's files and restarts its board. On a failure the board's held watchdog
 * reboots it into whatever it has by then.
 */
export async function uploadToTap(
    port: SerialPort,
    runtime: TapRuntime,
    onStep: (step: TapUploadStep) => void,
): Promise<void> {
    onStep({ step: 'connecting' });

    const repl = await MicroPythonRepl.open(port);
    try {
        await repl.enterRawRepl();
        await repl.holdWatchdog();

        const present = await repl.exists(runtime.prerequisites);
        const missing = runtime.prerequisites.filter((path) => !present[path]);
        if (missing.length) throw new MissingPrerequisites(missing);

        for (const [i, [path, content]] of runtime.files.entries()) {
            onStep({ step: 'file', path, done: i, total: runtime.files.length });
            await repl.writeFile(path, content);
        }

        onStep({ step: 'restarting' });
        await repl.hardReset();
    } finally {
        await repl.close();
    }
}
