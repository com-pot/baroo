<script lang="ts">
    import { onMount } from "svelte";
    import mascot from "./brand/minicon-letters.png"
    import { checkRecurringTask, updateLoop, type RecurringTask, type UpdateState } from "./brand/updateLoop";
    import { getUiFeedback } from "$lib/ui/uiFeedback.svelte";
    import { randArrItem } from "$lib/random";

    const uiFeedback = getUiFeedback()

    type Vector2D = { x: number; y: number }
    type Position = 'docked' | Vector2D

    type Goal =
        { goal: 'be' }
        | { goal: 'beAt', location: Vector2D }
        | { goal: 'dock', location: Vector2D }


    type Action = {
        type: 'walk',
        speedPerSec: Partial<Vector2D>,
    }

    function distance(a: Vector2D, b: Vector2D) {
        return Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2)
    }

    const utterance = {
        list: [
            "Ave, Já!",
            "Řekni sýr",
            "Dejte si výborný Guláš!",
        ],
    }
    function utter(utterance: string) {
        uiFeedback.plopResult(utterance, {fromEl: mascotEl?.querySelector('.char')!})
    }

    const moveInlineUtterances = [
        "Jé, co je tohle?",
        "Hele, tu!",
        "Tybrďo",
    ]

    const recurringTasks: RecurringTask[] = [
        {
            delay: 3_000,
            lastDone: 0,
            do() {
                if (char.position === "docked") {
                    return
                }

                if (Math.random() < 0.1) {
                    utter(randArrItem(utterance.list))
                }
            },
        },
        {
            delay: 2_000,
            lastDone: 0,
            do(state) {
                if (char.goal.goal !== "be" || char.action || char.position === "docked") {
                    return
                }
                if (undockedUntil < state.now) {
                    utter("Jdu domů")
                    setGoal({ goal: "dock", location: getDockedLocation() })
                    return
                }

                // 90% chance to move
                if (Math.random() < 0.1) return
                setGoal({ goal: "beAt", location: randLocationDx(char.position) }, null)
                // On move, 75% to speak
                if (Math.random() > 0.25) {
                    utter(randArrItem(moveInlineUtterances))
                }
            },
        }
    ]

    const char = $state({
        orientation: 'left' as 'left' | 'right',
        position: 'docked' as Position,

        goal: { goal: 'be' } as Goal,
        action: null as Action | null,
    })
    function setAction(action: Action | null) {
        // console.log("Set action", $state.snapshot(action))
        char.action = action
        if (action?.type === "walk") {
            char.orientation = Math.sign(action.speedPerSec.x ?? 0) < 0 ? 'left' : 'right'
        }
    }
    function setGoal(goal: Goal, action?: Action | null) {
        // console.log("Set goal", $state.snapshot(goal))
        char.goal = goal
        if (action !== undefined) setAction(action)
    }

    const actionExecutors: {
        [ActionType in Action["type"]]: (state: Readonly<UpdateState>, action: Action & {type: ActionType}) => void
    } = {
        walk({ dTs }, action) {
            if (char.position === "docked") {
                setAction(null)
                return
            }
            char.position.x += dTs * (action.speedPerSec.x ?? 0)
            char.position.y += dTs * (action.speedPerSec.y ?? 0)

            if (char.goal.goal === "beAt" || char.goal.goal === "dock") {
                const inProximity = distance(char.position, char.goal.location) < 10
                const xLessOk = ((action.speedPerSec.x ?? 0) < 0 && char.position.x < char.goal.location.x)
                const xMoreOk = ((action.speedPerSec.x ?? 0) > 0 && char.position.x > char.goal.location.x)

                if (inProximity || xLessOk || xMoreOk) {
                    if (char.goal.goal === "dock") {
                        char.position = "docked"
                        utter("Jé, pohodlí")
                    }
                    setGoal({ goal: "be" }, null)
                }

            }
        },
    }

    onMount(updateLoop((state) => {
        for (const task of recurringTasks) {
            checkRecurringTask(state, task)
        }

        if (char.action && char.action.type in actionExecutors) {
            actionExecutors[char.action.type](state, char.action)
        } else {
            if (char.goal.goal === "beAt" || char.goal.goal === "dock") {
                if (char.position === "docked") {
                    undock(state.now)
                }
                if (char.position === "docked") {
                    console.warn("Couldn't undock")
                    return
                }

                const xDirection = Math.sign(char.goal.location.x - char.position.x)
                setAction({
                    type: "walk",
                    speedPerSec: {
                        x: xDirection * 60,
                    },
                })
            }
        }
    }))

    let mascotEl = $state<HTMLDivElement>()
    function deriveStylePosition(position: typeof char['position']) {
        if (position === 'docked') {
            return ''
        }

        return `--x:${position.x}px;--y:${position.y}px;`
    }
    const mascotStyle = $derived(
        deriveStylePosition(char.position)
    )

    let undockedUntil = 0
    function undock(now: UpdateState["now"]) {
        if (char.position !== "docked") {
            return
        }

        char.position = getDockedLocation()
        undockedUntil = now + 20_000
    }
    function getDockedLocation() {
        const baseBox = mascotEl!.getBoundingClientRect()
        return {
            x: baseBox.x,
            y: baseBox.y,
        }
    }

    function randLocationDx(from: Vector2D): Vector2D {
        const dX = (Math.random() - 0.5) * 200
        const padding = 100

        return {
            x: Math.min(Math.max(padding, from.x + dX), window.innerWidth - padding),
            y: from.y,
        }
    }

    function mascotClick(e: MouseEvent) {
        if (char.position === "docked") {
            undock(Date.now())
            setGoal({goal: "beAt", location: { x: char.position.x - 200, y: char.position.y }})

            return
        }

        utter("Heeej!")
        if (char.goal.goal === "dock") {
            undockedUntil = Date.now() + 5_000
        }

        setGoal({ goal: "beAt", location: randLocationDx(char.position) }, null)

    }
</script>

<div class="mascot" role="presentation"
    data-position={char.position === 'docked' ? 'docked' : 'fixed'}
    data-action={char.action?.type ?? '-'}
    data-orientation={char.orientation}
    style={mascotStyle}
    onclick={(e) => mascotClick(e)}
    bind:this={mascotEl}
>
    <img src={mascot} alt="" class="char"/>
    <img src={mascot} alt="" class="station"/>
</div>

<style lang="scss">
.mascot {
    position: fixed;
    inset-block-end: 2rem;
    inset-inline-end: 2rem;
    display: grid;

    > img {
        aspect-ratio: 1185 / 1517;
        width: 8ch;
        height: auto;

        grid-area: 1/1;
    }
    .char {
        clip-path: polygon(
            0 0,
            100% 0,
            100% 75%,
            0 71%,
        );
    }
    .station {
        clip-path: polygon(
            0 100%,
            100% 100%,
            100% 75%,
            0 71%,
        );
    }

    &[data-position="fixed"] {
        .char {
            position: fixed;
            left: var(--x); top: var(--y);
        }
    }
    &[data-action="walk"] {
        .char {
            animation: walkBoing 0.5s forwards infinite;
        }
    }

    &[data-orientation="right"]:not([data-position="docked"]) {
        .char {
            scale: -1 1;
        }
    }
}

@keyframes walkBoing {
    0% {
        transform: rotate(0) translateY(0px);
    }
    1% {
        transform: rotate(-10deg) translateY(0px);
    }
    50% {
        transform: rotate(-10deg) translateY(-10px);
    }
    51% {
        transform: rotate(10deg) translateY(0px);
    }
    100% {
        transform: rotate(10deg) translateY(-10px);
    }
}
</style>
