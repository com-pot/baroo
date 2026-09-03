import { browser } from '$app/environment';

const LETTERS_KEY = 'baroo.kiosk.idInputLetters';

/**
 * Preferences a barman flips on the tablet in front of them.
 *
 * Unlike `PosDeviceConfig` these never travel: they answer "how should this one tablet
 * behave right now", and waiting for a backstage edit plus a snapshot pull is no answer
 * with a queue at the bar. localStorage rather than the offline DB for the same reason —
 * it is read synchronously during render, so the field never flickers into the wrong mode.
 */
class KioskPrefs {
    /**
     * Whether the manual id field asks for a full keyboard.
     *
     * Off means `inputmode="numeric"`, which on a tablet is a bare keypad: right for the
     * badge numbers that are nearly every manual entry, and with no way to reach letters.
     * Since no on-screen keyboard offers a numeric-first layout that can *become* a full
     * one, the switch has to live outside the field.
     */
    #idInputLetters = $state(false);

    constructor() {
        this.#idInputLetters = this.#read(LETTERS_KEY);
    }

    get idInputLetters(): boolean {
        return this.#idInputLetters;
    }

    set idInputLetters(value: boolean) {
        this.#idInputLetters = value;
        this.#write(LETTERS_KEY, value);
    }

    /** The keyboard the manual id field should bring up. */
    get idInputMode(): 'text' | 'numeric' {
        return this.#idInputLetters ? 'text' : 'numeric';
    }

    // Storage is allowed to be missing or to throw outright (a locked-down tablet, a
    // private window): a kiosk that cannot remember the preference still has to boot.
    #read(key: string): boolean {
        if (!browser) return false;
        try {
            return localStorage.getItem(key) === 'true';
        } catch {
            return false;
        }
    }

    #write(key: string, value: boolean): void {
        if (!browser) return;
        try {
            localStorage.setItem(key, String(value));
        } catch {
            // The toggle still holds for this session; only outliving a reload is lost.
        }
    }
}

/** One instance per tab — the drawer sets it, the kiosk field reads it. */
export const kioskPrefs = new KioskPrefs();
