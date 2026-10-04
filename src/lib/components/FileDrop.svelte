<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { getRenderer } from "$lib/rendering.svelte";
    import FormErrors from "./FormErrors.svelte";

    const renderer = getRenderer()

    let {
        name,
        accept = "image/*",
        maxBytes,
        aspectRatio,
        aspectLabel,
        currentSrc = null,
        hint,
        disabled = false,
        onselect,
    }: {
        name: string,
        accept?: string;
        maxBytes?: number;
        aspectRatio?: number;
        aspectLabel?: string;
        currentSrc?: string | null;
        hint?: string;
        disabled?: boolean;
        onselect?: (file: File | null) => void;
    } = $props();

    let input = $state<HTMLInputElement>();
    let dragging = $state(false);
    let error = $state<string | null>(null);
    let picked = $state<{ file: File; url: string } | null>(null);

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

    async function take(file: File | undefined) {
        if (disabled || !file) return;

        if (!accepts(file)) {
            reject(m["generic.file_drop.not_accepted"]({ name: file.name }));
            return;
        }

        if (maxBytes !== undefined && file.size > maxBytes) {
            reject(m["generic.file_drop.too_large"]({
                size: renderer.formatBytes(file.size),
                max: renderer.formatBytes(maxBytes),
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
        onselect?.(file);
    }

    function reject(message: string) {
        error = message;
        clear();
    }

    function clear() {
        setPicked(null);
        if (input) input.value = "";
        onselect?.(null);
    }

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

<div class="file-drop">
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
        <button type="button" class="btn btn-icon btn-outline-secondary clear"
            onclick={clear}
            title={m["generic.file_drop.clear"]()}
        >
            <span role="presentation">✖️</span>
        </button>
    {/if}
    <FormErrors error={error} />
</div>

<style lang="scss">
    .zone {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.11rem;
        border: 2px dashed var(--bs-border-color);
        border-radius: 0.5rem;
        background: var(--bs-body-bg);
        cursor: pointer;
        transition: border-color 0.15s, background-color 0.15s;

        input {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
            pointer-events: none;
        }

        &.dragging {
            border-color: var(--bs-primary);
            background: var(--bs-primary-bg-subtle);
        }

        &:has(input:focus-visible) {
            outline: 2px solid var(--bs-primary);
            outline-offset: 2px;
        }

        &:has(input:disabled) {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }

    .preview {
        flex-shrink: 0;
        width: 4rem;
        height: 4rem;
        object-fit: contain;
        background: #fff;
        border: 1px solid var(--bs-border-color);
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

    .file-drop {
        position: relative;

        .clear {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
        }
    }
</style>
