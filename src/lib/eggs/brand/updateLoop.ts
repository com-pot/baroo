export type UpdateState = {
    now: ReturnType<typeof Date["now"]>,
    prevTick: ReturnType<typeof Date["now"]>,
    dT: number,
    dTs: number,
}

type UpdateFn = (loop: Readonly<UpdateState>) => void

export function updateLoop(update: UpdateFn): () => void {

    let nextTickRaf: ReturnType<typeof requestAnimationFrame>
    const state: UpdateState = {
        now: 0,
        prevTick: 0,
        dT: Number.MAX_VALUE,
        dTs: Number.MAX_VALUE,
    }

    function tick() {
        state.prevTick = state.now
        state.now = Date.now()

        state.dT = state.now - state.prevTick
        state.dTs = state.dT / 1_000

        update(state)

        nextTickRaf = requestAnimationFrame(tick)
    }

    return () => {
        state.now = state.prevTick = Date.now()
        nextTickRaf = requestAnimationFrame(tick)
    }
}


export type RecurringTask = {
    delay: number,
    lastDone: UpdateState["now"],
    do: (state: UpdateState) => void,
}

export function checkRecurringTask(state: UpdateState, task: RecurringTask) {
    if (state.now - task.lastDone <= task.delay) return
    task.do(state)
    task.lastDone = state.now
}
