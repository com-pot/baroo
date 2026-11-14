export class ServerI18n {
    public constructor(
        public readonly locale: import('$lib/paraglide/runtime.js').Locale,
    ) {

    }

    public pick<T>(item: Record<string, T>|undefined): T | undefined {
        return item?.[this.locale]
    }
}
