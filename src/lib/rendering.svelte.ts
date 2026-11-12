import { createContext } from "svelte";
import { isMessageRef, printMessageRef, type Printable } from "./i18n";

type Currency = NonNullable<Intl.NumberFormatOptions["currency"]>

export class Renderer {

    public readonly dateFormatter = $derived.by(() => {
        return new Intl.DateTimeFormat(this.opts.locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    })

    private priceFormatters = new Map<string, Intl.NumberFormat>()
    private getPriceFormatter(currency: Currency) {
        const key = `${this.opts.locale}-${currency}`
        let formatter = this.priceFormatters.get(key)
        if (formatter) return formatter

        formatter = new Intl.NumberFormat(this.opts.locale, {
            style: "currency",
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })

        this.priceFormatters.set(key, formatter)
        return formatter
    }

    constructor(private readonly opts: {locale: string}) {

    }

    formatCurrency(currency: Currency, amount: number) {
        const formatter = this.getPriceFormatter(currency)
        return formatter.format(amount)
    }
    currencySymbol(currency: Currency): string {
        const part = this.getPriceFormatter(currency)
            .formatToParts()
            .find((part) => part.type === "currency")

        return part?.value || "---"
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
        if (isMessageRef(s)) {
            return printMessageRef(s)
        }
        if (typeof s === "object") {
            return s[this.opts.locale] ?? ""
        }

        return `${s}`
    }
}

export const [getRenderer, setRenderer] = createContext<Renderer>()
