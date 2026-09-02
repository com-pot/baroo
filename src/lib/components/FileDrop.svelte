<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { formatBytes } from "$lib/bar/quantity";

    /**
     * A drop zone for one file, which checks it before handing it over.
     *
     * The zone is a `<label>` wrapped round a real file input rather than a div with
     * click handlers: that is what makes it reachable by keyboard and announced as a file
     * control without a line of ARIA. Drag and drop is the enhancement layered on top.
     *
     * Nothing is uploaded here — the component's whole output is `onselect`, so the page
     * decides what a picked file means. `null` means the pending pick was discarded.
     */
    let {
        accept = "image/*",
        maxBytes,
        aspectRatio,
        /** How that ratio should read in the error, e.g. "1:1". */
        aspectLabel,
        /** Already stored and shown until something is picked. */
        currentSrc = null,
        hint,
        disabled = false,
        onselect,
    }: {
        accept?: string;
        maxBytes?: number;
        aspectRatio?: number;
        aspectLabel?: string;
        currentSrc?: string | null;
        hint?: string;
        disabled?: boolean;
        onselect: (file: File | null) => void;
    } = $props();

    let input = $state<HTMLInputElement>();
    let dragging = $state(false);
    let error = $state<string | null>(null);
    let picked = $state<{ file: File; url: string } | null>(null);

    /** Images can be off by a pixel or two of rounding and still be square enough. */
    const ASPECT_TOLERANCE = 0.02;

    function accepts(file: File): boolean {
        return accept
            .split(",")
            .map((pattern) => pattern.trim())
            .filter(Boolean)
            .some((pattern) =>
                pattern.endsWith("/*")
                    ? file.type.startsWith(pattern.slice(0, -1))
                    : pattern.startsWith(".")
                      ? file.name.toLowerCase().endsWith(pattern.toLowerCase())
                      : file.type === pattern,
            );
    }

    /** Natural size of an image file, or `null` if it is not decodable as one. */
    async function measure(file: File): Promise<{ width: number; height: number } | null> {
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            return { width: image.naturalWidth, height: image.naturalHeight };
        } catch {
            return null;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /** Runs every check in turn; the first complaint wins and nothing is emitted. */
    async function take(file: File | undefined) {
        if (disabled || !file) return;

        if (!accepts(file)) {
            reject(m["generic.file_drop.not_accepted"]({ name: file.name }));
            return;
        }

        if (maxBytes !== undefined && file.size > maxBytes) {
            reject(m["generic.file_drop.too_large"]({
                size: formatBytes(file.size),
                max: formatBytes(maxBytes),
            }));
            return;
        }

        if (aspectRatio !== undefined) {
            const size = await measure(file);
            if (!size || !size.height) {
                reject(m["generic.file_drop.unreadable"]());
                return;
            }

            if (Math.abs(size.width / size.height - aspectRatio) > ASPECT_TOLERANCE) {
                reject(m["generic.file_drop.bad_aspect"]({
                    ratio: aspectLabel ?? String(aspectRatio),
                    width: String(size.width),
                    height: String(size.height),
                }));
                return;
            }
        }

        error = null;
        setPicked({ file, url: URL.createObjectURL(file) });
        onselect(file);
    }

    function reject(message: string) {
        error = message;
        clear();
    }

    function clear() {
        setPicked(null);
        // The native input keeps the rejected file, and would then not fire `change` if
        // the same one were picked again — which is exactly what someone retries first.
        if (input) input.value = "";
        onselect(null);
    }

    /** Sole writer of `picked`, so no object URL is ever dropped without being revoked. */
    function setPicked(next: { file: File; url: string } | null) {
        if (picked) URL.revokeObjectURL(picked.url);
        picked = next;
    }

    $effect(() => () => setPicked(null));

    function onDrop(event: DragEvent) {
        event.preventDefault();
        dragging = false;
        void take(event.dataTransfer?.files?.[0]);
    }
</script>

<div class="file-drop" class:disabled>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <label
        class="zone"
        class:dragging
        ondragover={(event) => {
            event.preventDefault();
            if (!disabled) dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        ondrop={onDrop}
    >
        <input
            bind:this={input}
            type="file"
            class="native"
            {accept}
            {disabled}
            onchange={(event) => void take(event.currentTarget.files?.[0])}
        />

        {#if picked || currentSrc}
            <img class="preview" src={picked?.url ?? currentSrc} alt="" />
        {/if}

        <span class="copy">
            <span class="prompt">{m["generic.file_drop.prompt"]()}</span>
            {#if hint}<span class="hint">{hint}</span>{/if}
            {#if picked}<span class="filename">{picked.file.name}</span>{/if}
        </span>
    </label>

    {#if picked}
        <button type="button" class="btn btn-link clear" onclick={clear}>
            {m["generic.file_drop.clear"]()}
        </button>
    {/if}

    {#if error}
        <p class="error-message" role="alert">{error}</p>
    {/if}
</div>

<style lang="scss">
    .zone {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        border: 2px dashed #ced4da;
        border-radius: 0.5rem;
        background: #fbfbfc;
        cursor: pointer;
        transition: border-color 0.15s, background-color 0.15s;

        &.dragging {
            border-color: #0d6efd;
            background: #eef4ff;
        }

        // The input is the focusable thing, so the ring has to be drawn around its label.
        &:has(.native:focus-visible) {
            outline: 2px solid #0d6efd;
            outline-offset: 2px;
        }
    }

    // Off-screen rather than `display: none`, which would take the input out of the tab
    // order and leave the zone unreachable without a mouse.
    .native {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
    }

    .preview {
        flex-shrink: 0;
        width: 4rem;
        height: 4rem;
        object-fit: contain;
        background: #fff;
        border: 1px solid #dee2e6;
        border-radius: 0.375rem;
    }

    .copy {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
    }

    .prompt {
        font-size: 0.95rem;
    }

    .hint,
    .filename {
        font-size: 0.85rem;
        color: #6c757d;
    }

    .filename {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .clear {
        align-self: start;
        padding: 0.25rem 0;
    }

    .disabled .zone {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .error-message {
        margin: 0.35rem 0 0;
        color: #b02a37;
        font-size: 0.875rem;
    }
</style>
