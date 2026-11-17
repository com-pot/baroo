<script lang="ts">
    import QRCode from "qrcode"

    import {
        "credits.contributors" as credits_contributors,
        "credits.followLink" as credits_followLink,
    } from "$lib/paraglide/messages";
    import { getUiFeedback } from "$lib/ui/uiFeedback.svelte";
    import { contributors } from "./credits/contributors";

    const uiFeedback = getUiFeedback()


    let visibleContributor = $state('')
    async function renderFollowLink(e: MouseEvent, contributor: typeof contributors[number]) {
        const link = contributor.contact.links[0]
        const canvas = document.querySelector(`.contributors [data-id="${contributor.id}"] canvas`) as HTMLCanvasElement
        if (!link || !canvas) {
            uiFeedback.plopResult("?!?", {
                fromEl: e.currentTarget as HTMLElement,
                level: "warning",
            })
            return
        }
        if (visibleContributor === contributor.id) {
            visibleContributor = ''
            return
        }

        await QRCode.toCanvas(canvas, link.href, {
            width: canvas.width,
        })
        visibleContributor = contributor.id
    }
</script>

<div class="credits">
    <h2>{credits_contributors()}</h2>
    <div class="items-grid contributors">
        {#each contributors as contributor (contributor.id)}
            <article class="tile" data-id={contributor.id}>
                <div class="avatar">
                    <img src={contributor.avatar} alt="">
                </div>
                <button class="btn btn-icon btn-outline-primary" onclick={(e) => renderFollowLink(e, contributor)}>
                    <span aria-label={credits_followLink()}><span role="img">🔗</span></span>
                </button>
                <div class="descriptive">
                    <h3 class="label">
                        <span>{contributor.contact.fullName}</span>
                    </h3>
                    <p>{contributor.contributionNote}</p>
                </div>

                <canvas width="200" height="200" aria-current={visibleContributor === contributor.id}></canvas>
            </article>
        {/each}
    </div>
</div>

<style lang="scss">
    .contributors {
        --item-size: 16ch;
        place-content: center;

        > article {
            display: grid;
            gap: 0.5rem;

            > :not(.descriptive) {
                grid-area: 1 / 1;
                place-self: center;
                max-width: 100%;
            }
            > .descriptive {
                grid-area: 2 / 1;
            }

            img {
                width: 100%;
            }
            > button.btn-icon {
                z-index: 2;
                place-self: end;
                margin: 0.25rem;
                background-color: var(--bs-body-bg);
            }
            > canvas {
                margin: 1rem;

                // Important to override inline-styles set by qrcode library
                width: 90% !important;
                height: auto !important;
            }
        }

        canvas {
            transition: scale 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);

            &:not([aria-current="true"]) {
                scale: 0;
            }
        }
    }
</style>
