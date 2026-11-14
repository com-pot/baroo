import type { Printable } from "$lib/i18n";
import { getContext, hasContext, setContext } from "svelte";

export type OptionsList = { value: string, label: Printable }[]

export type OptionsLists = Record<string, OptionsList>;


const optionsListCtxKey = Symbol("optionsList")
export const setOptionsList = (value: () => OptionsLists) => setContext(optionsListCtxKey, value)
export const getOptionsLists = (): ReturnType<typeof setOptionsList> => {
    if (!hasContext(optionsListCtxKey)) {
        return () => ({})
    }
    return getContext(optionsListCtxKey)
}
