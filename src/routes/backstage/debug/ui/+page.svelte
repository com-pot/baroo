<script lang="ts">
    import { randArrItem } from "$lib/random";
    import { bsLevels, getUiFeedback } from "$lib/ui/uiFeedback.svelte";

    const uiFeedback = getUiFeedback()
</script>

<main class="container">
<h1>Ui debug view</h1>

<h2>UiFeedback</h2>
<button onclick={(e) => {
    uiFeedback.plopResult("Pop", {
        fromEl: e.currentTarget,
        level: randArrItem(bsLevels),
    })
}}>Pop it!</button>
</main>
