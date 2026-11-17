import { browser } from "$app/environment";
import type { Printable } from "$lib/i18n";
import { round } from "$lib/number";
import { randNum } from "$lib/random";
import type { Renderer } from "$lib/rendering.svelte";
import { createContext } from "svelte";

export const bsLevels = ["success", "info", "warning", "danger"] as const

type BsLevels = typeof bsLevels[number]

export class UiFeedback {

    constructor(private renderer: Renderer) {

    }

    plopResult(message: Printable, opts: SignalOpts) {
        if (!browser) return false
        const level = opts.level || "info"

        const fromRect = opts.fromEl.getBoundingClientRect()
        const offset = round(Math.random())
        const rotateNorm = (offset - 0.5) * 2
        const from = {
            x: fromRect.x + fromRect.width * offset,
            y: fromRect.y,
        }

        const el = document.createElement("span")
        el.innerText = this.renderer.print(message)
        el.classList.add('badge', `bg-${level}`, 'ui-plop')

        el.style = `--x:${from.x}px; --y:${from.y}px;`
            + `--rotate-norm:${rotateNorm};`
            + `--y-hop:${round(randNum(1, 2))}rem;`
            +`--target-x:${round(randNum(-1, 1) + (offset - 0.5) * 3)}rem;`
            +`--target-y:${round(randNum(0.25, -0.75))}rem;`

        el.addEventListener("animationend", () => {
            el.remove()
        }, { once: true })
        document.body.append(el)
    }
}

type SignalOpts = {
    fromEl: HTMLElement,
    level?: BsLevels,
}

export const [getUiFeedback, setUiFeedback] = createContext<UiFeedback>()
