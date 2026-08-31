<script lang="ts">
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { TagMapper, type TagMapping } from "$lib/bar/tags";
    import { onMount } from "svelte";
    import Drawer from "$lib/components/Drawer.svelte";

    import type { PageData } from "./$types";

    const { data }: { data: PageData } = $props();

    const mapper = new TagMapper(data.ref);

    /** The mapper's cache, mirrored into a rune so the table redraws itself. */
    let mappings = $state<TagMapping[]>([]);
    let statusMessage = $state("");
    let isImportDrawerOpen = $state(false);
    let importData = $state("");

    let serialId = $state("");
    let userId = $state("");
    let nickName = $state("");
    /** Until the scanner is started there is no reader to fill the field in for us. */
    let serialReadOnly = $state(true);

    const sync = () => (mappings = [...mapper.mappings]);

    /**
     * One row per person, not per card — a member may carry a spare, and seeing both
     * under one name is the whole point of the page.
     */
    const members = $derived.by(() => {
        const byUser = new Map<string, { userId: string; nickName: string; tags: TagMapping[] }>();

        for (const mapping of mappings) {
            const entry = byUser.get(mapping.userId) ?? {
                userId: mapping.userId,
                nickName: mapping.nickName,
                tags: [],
            };
            entry.tags.push(mapping);
            byUser.set(mapping.userId, entry);
        }

        return [...byUser.values()];
    });

    async function persistUser(e: SubmitEvent) {
        e.preventDefault();
        const entry = { serialId, userId, nickName };

        if (!mapper.isValid(entry)) {
            alert(m["baroo.backstage.mapper.invalid_data"]());
            return;
        }

        await mapper.put(entry);
        sync();

        statusMessage = m["baroo.backstage.mapper.mapped"]({
            serialId: entry.serialId,
            userId: entry.userId,
            nickName: entry.nickName,
        });

        serialId = "";
        userId = "";
        nickName = "";
    }

    async function removeMapping(mapping: TagMapping) {
        const confirmed = confirm(
            m["baroo.backstage.mapper.remove_confirm"]({
                serialId: mapping.serialId,
                nickName: mapping.nickName,
            }),
        );
        if (!confirmed) return;

        try {
            await mapper.remove(mapping.serialId);
            sync();
            statusMessage = m["baroo.backstage.mapper.removed"]({
                serialId: mapping.serialId,
                nickName: mapping.nickName,
            });
        } catch (error) {
            alert(String(error));
        }
    }

    function startMapper() {
        initializeScanner();
        document.body.dataset.bootStatus = "ready";
    }

    function initializeScanner() {
        if (!("NDEFReader" in window)) {
            serialReadOnly = false;
            statusMessage = m["baroo.backstage.mapper.nfc_not_supported"]();
            return;
        }

        const ndef = new NDEFReader();
        ndef.scan()
            .then(() => {
                ndef.onreadingerror = () => {
                    console.log(m["baroo.backstage.mapper.read_error"]());
                };
                ndef.onreading = async (event: any) => {
                    serialId = event.serialNumber;
                    const member = await mapper.get(serialId);
                    if (member) {
                        userId = member.userId;
                        nickName = member.nickName;
                    }

                    document.getElementById("userId")?.focus();
                };
            })
            .catch((error) => {
                alert(m["baroo.backstage.mapper.scan_error"]({ error: String(error) }));
            });
    }

    async function handleImport(e: SubmitEvent) {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const csvData = formData.get('importData') as string;

        if (!csvData?.trim()) {
            alert(m["baroo.backstage.mapper.invalid_import_format"]());
            return;
        }

        try {
            const result = await mapper.bulkImport(csvData);

            if (result.errors.length > 0) {
                console.warn('Import errors:', result.errors);
                alert(m["baroo.backstage.mapper.import_error"]({ error: result.errors.join('; ') }));
            }

            if (result.success > 0) {
                statusMessage = m["baroo.backstage.mapper.import_success"]({ count: String(result.success) });
                sync();
                importData = '';
                isImportDrawerOpen = false;
            }

        } catch (error) {
            alert(m["baroo.backstage.mapper.import_error"]({ error: String(error) }));
        }
    }

    onMount(() => {
        mapper.load().then(sync);
    });
</script>

<svelte:head>
    <title>{m["baroo.backstage.mapper.title"]({ barName: data.bar?.name || data.ref })}</title>
</svelte:head>

<main class="backstage-content">
    <header class="page-header">
        <h1>{m["baroo.backstage.mapper.title"]({ barName: data.bar?.name || data.ref })}</h1>
        <div class="actions">
            <button class="btn btn-sm btn-primary" onclick={() => startMapper()}>{m["baroo.backstage.mapper.start_mapper"]()}</button>
            <button class="btn btn-sm btn-secondary" onclick={() => isImportDrawerOpen = true}>{m["baroo.backstage.mapper.mapping_import"]()}</button>
            <a class="btn btn-sm btn-outline-secondary" href="/backstage/bars/{data.ref}/summaries">{m["baroo.backstage.bar.member_summaries"]()}</a>
        </div>
    </header>

    <div id="status">
        <p>{m["baroo.backstage.mapper.status"]()} <span id="status-message">{statusMessage}</span></p>
    </div>

    <form onsubmit={persistUser} autocomplete="off">
        <fieldset class="grid-layout">
            <div class="input-pair">
                <label for="serialId" class="form-label">{m["baroo.backstage.mapper.nfc_tag"]()}</label>
                <input type="text" id="serialId" name="serialId" class="form-control" bind:value={serialId} required readonly={serialReadOnly} />
            </div>

            <div class="input-pair">
                <label for="userId" class="form-label">{m["baroo.backstage.mapper.user_id"]()}</label>
                <input type="text" id="userId" name="userId" class="form-control" bind:value={userId} required />
            </div>

            <div class="input-pair">
                <label for="nickName" class="form-label">{m["baroo.backstage.mapper.nickname"]()}</label>
                <input type="text" id="nickName" name="nickName" class="form-control" bind:value={nickName} required />
            </div>

            <div class="input-pair">
                <input type="submit" value={m["baroo.backstage.mapper.map_button"]()} class="btn btn-primary" />
            </div>
        </fieldset>
    </form>

    <table class="table mappings">
        <thead>
            <tr>
                <th data-name="user">{m["baroo.backstage.mapper.user_col"]()}</th>
                <th data-name="tags">{m["baroo.backstage.mapper.tags_col"]()}</th>
            </tr>
        </thead>
        <tbody>
            {#each members as member (member.userId)}
                <tr>
                    <td data-name="user">
                        <span class="nick-name">{member.nickName}</span>
                        <small class="user-id">{member.userId}</small>
                    </td>
                    <td data-name="tags">
                        <div class="tags">
                            {#each member.tags as tag (tag.serialId)}
                                <span class="badge text-bg-secondary">
                                    {tag.serialId}
                                    <button
                                        type="button"
                                        class="btn-remove"
                                        aria-label={m["baroo.backstage.mapper.remove_tag"]()}
                                        title={m["baroo.backstage.mapper.remove_tag"]()}
                                        onclick={() => removeMapping(tag)}
                                    >✖️</button>
                                </span>
                            {/each}
                        </div>
                    </td>
                </tr>
            {:else}
                <tr>
                    <td colspan="2">{m["baroo.backstage.mapper.no_mappings"]()}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</main>

{#if isImportDrawerOpen}
<Drawer bind:isOpen={isImportDrawerOpen}>
    {#snippet heading()}
        {m["baroo.backstage.mapper.import_drawer_title"]()}
    {/snippet}

    <form onsubmit={handleImport}>
        <div class="form-group">
            <label for="importData" class="form-label">
                {m["baroo.backstage.mapper.import_data_label"]()}
            </label>
            <textarea
                id="importData"
                name="importData"
                bind:value={importData}
                class="form-control"
                rows="10"
                required>
            </textarea>
        </div>
        <div class="form-actions">
            <button type="submit" class="btn btn-primary">
                {m["baroo.backstage.mapper.import_button"]()}
            </button>
        </div>
    </form>
</Drawer>
{/if}

<style lang="scss">
    .mappings {
        [data-name="user"] {
            display: flex;
            flex-direction: column;
            gap: 0.1rem;
        }

        .nick-name {
            font-weight: 600;
        }

        .user-id {
            opacity: 0.6;
            font-family: monospace;
        }

        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            font-family: monospace;
        }

        .btn-remove {
            background: none;
            border: 0;
            padding: 0;
            line-height: 1;
            font-size: 0.8em;
            cursor: pointer;
        }
    }
</style>
