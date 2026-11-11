import { createContext } from "svelte";

type OptionsList = { value: string, label: string }[]

export type OptionsLists = Record<string, OptionsList>;

export const [getOptionsLists, setOptionsList] = createContext<() => OptionsLists>()
