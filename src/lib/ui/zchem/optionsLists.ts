import type { Printable } from "$lib/i18n";
import { getContext, hasContext, setContext } from "svelte";

export type ListOption<T extends string|number = string|number> = { value: T, label: Printable }
export type OptionsList<T extends string|number = string|number> = ListOption<T>[]

export type OptionsLists = Record<string, OptionsList>;


const optionsListCtxKey = Symbol("optionsList")
export const setOptionsList = (value: () => OptionsLists) => setContext(optionsListCtxKey, value)
export const getOptionsLists = (): ReturnType<typeof setOptionsList> => {
    if (!hasContext(optionsListCtxKey)) {
        return () => ({})
    }
    return getContext(optionsListCtxKey)
}
