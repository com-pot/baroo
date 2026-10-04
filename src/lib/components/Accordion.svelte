<script lang="ts">
    import type { Snippet } from "svelte";
    import "./accordion.scss";

    let {
        title,
        name,
        open = false,
        children,
    }: {
        title: string;
        name?: string;
        open?: boolean;
        children: Snippet;
    } = $props();
</script>

<details class="accordion card" {name} {open}>
    <summary>
        <h3>{title}</h3>
    </summary>
    <div class="card-body">
        {@render children()}
    </div>
</details>
