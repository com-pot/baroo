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
