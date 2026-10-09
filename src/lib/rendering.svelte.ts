import { createContext } from "svelte";
import type { Printable } from "./i18n";

export class Renderer {

    public readonly dateFormatter = $derived.by(() => {
        console.log("Get dateFormatter", this.opts.locale)
        return new Intl.DateTimeFormat(this.opts.locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    })

    constructor(private readonly opts: {locale: string}) {

    }

    formatDate(dateStr: Date|string) {
        const date = new Date(dateStr);
        return this.dateFormatter.format(date);
    }

    formatBytes(bytes: number): string {
        if (bytes < 1000) return `${bytes} B`;

        const units = ['kB', 'MB', 'GB'];
        let value = bytes / 1000;
        let unit = 0;

        while (value >= 1000 && unit < units.length - 1) {
            value /= 1000;
            unit++;
        }

        return `${new Intl.NumberFormat(this.opts.locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
    }


    public print(s: Printable) {
        if (!s) return ""
        if (typeof s === "string") return s
        if (typeof s === "object") {
            return s[this.opts.locale] ?? ""
        }

        return `${s}`
    }
}

export const [getRenderer, setRenderer] = createContext<Renderer>()
