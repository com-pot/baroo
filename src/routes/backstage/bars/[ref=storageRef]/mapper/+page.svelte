<script lang="ts">
    import "$lib/assets/boot.scss";
    import * as m from "$lib/paraglide/messages.js";
    import { TagMapper } from "$lib/bar/tags";
    import { onMount } from "svelte";
    import Drawer from "$lib/components/Drawer.svelte";

    import type { PageData } from "./$types";
    import { stringifyStorageRef } from "$lib/bar/refs";

    const { data }: { data: PageData } = $props();

    const mapper = new TagMapper(data.ref);
    let isImportDrawerOpen = $state(false);
    let importData = $state('');

    function persistUser(e: SubmitEvent) {
        const form = e.target as HTMLFormElement;
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        if (!mapper.isValid(data)) {
            alert(m["baroo.backstage.mapper.invalid_data"]());
            return false;
        }
        mapper.put(data);

        renderMappings();
        form.reset();
        document.getElementById("status-message")!.innerText =m["baroo.backstage.mapper.mapped"]({
            serialId: String(data.serialId),
            userId: String(data.userId),
            nickName: String(data.nickName),
        });

        return false;
    }

    function renderMappings() {
        const tbody = document.getElementById("mappings")!;
        tbody.innerHTML = "";

        for (const mapping of mapper.mappings) {
            const tr = document.createElement("tr");

            const tdTag = document.createElement("td");
            tdTag.innerText = mapping.serialId;
            tr.appendChild(tdTag);

            const tdUserId = document.createElement("td");
            tdUserId.innerText = mapping.userId;
            tr.appendChild(tdUserId);

            const tdNickName = document.createElement("td");
            tdNickName.innerText = mapping.nickName;
            tr.appendChild(tdNickName);

            tbody.appendChild(tr);
        }
    }

    function startMapper() {
        initializeScanner();
        document.body.dataset.bootStatus = "ready";
    }

    function initializeScanner() {
        const tagInput = document.getElementById("serialId") as HTMLInputElement;
        const userId = document.getElementById("userId") as HTMLInputElement;
        const nickName = document.getElementById("nickName") as HTMLInputElement;

        if (!("NDEFReader" in window)) {
            tagInput.readOnly = false;
            document.getElementById("status-message")!.innerText =
                m["baroo.backstage.mapper.nfc_not_supported"]();
            return;
        }

        const ndef = new NDEFReader();
        ndef.scan()
            .then(() => {
                ndef.onreadingerror = () => {

                    console.log(
                        m["baroo.backstage.mapper.read_error"](),
                    );
                };
                ndef.onreading = async (event: any) => {
                    tagInput.value = event.serialNumber;
                    const member = await mapper.get(tagInput.value);
                    if (member) {
                        userId.value = member.userId;
                        nickName.value = member.nickName;
                    }

                    userId.focus();
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
                document.getElementById("status-message")!.innerText = m["baroo.backstage.mapper.import_success"]({ count: String(result.success) });
                renderMappings();
                importData = '';
                isImportDrawerOpen = false;
            }

        } catch (error) {
            alert(m["baroo.backstage.mapper.import_error"]({ error: String(error) }));
        }
    }

    onMount(() => {
        mapper.load()
            .then(() => {
                renderMappings();
            })
    });
</script>

<svelte:head>
    <title>{m["baroo.backstage.mapper.title"]({ barName: data.bar?.name || data.ref.key })}</title>
</svelte:head>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a> /
    <a href="/backstage/bars/{stringifyStorageRef(data.ref)}">{data.bar?.name || stringifyStorageRef(data.ref)}</a> /
    <span>{m["baroo.backstage.mapper.breadcrumb"]()}</span>
</nav>

<main class="backstage-content">
    <header class="page-header">
        <h1>{m["baroo.backstage.mapper.title"]({ barName: data.bar?.name || data.ref.key })}</h1>
        <div class="actions">
            <button class="btn btn-sm btn-primary" onclick={() => startMapper()}>{m["baroo.backstage.mapper.start_mapper"]()}</button>
            <button class="btn btn-sm btn-secondary" onclick={() => isImportDrawerOpen = true}>{m["baroo.backstage.mapper.mapping_import"]()}</button>
        </div>
    </header>

    <div id="status">
        <p>{m["baroo.backstage.mapper.status"]()} <span id="status-message"></span></p>
    </div>

    <form onsubmit={(event) => persistUser(event)} autocomplete="off">
        <fieldset class="grid-layout">
            <div class="input-pair">
                <label for="serialId" class="form-label">{m["baroo.backstage.mapper.nfc_tag"]()}</label>
                <input type="text" id="serialId" name="serialId" class="form-control" required readonly />
            </div>

            <div class="input-pair">
                <label for="userId" class="form-label">{m["baroo.backstage.mapper.user_id"]()}</label>
                <input type="text" id="userId" name="userId" class="form-control" required />
            </div>

            <div class="input-pair">
                <label for="nickName" class="form-label">{m["baroo.backstage.mapper.nickname"]()}</label>
                <input type="text" id="nickName" name="nickName" class="form-control" required />
            </div>

            <div class="input-pair">
                <input type="submit" value={m["baroo.backstage.mapper.map_button"]()} class="btn btn-primary" />
            </div>
        </fieldset>
    </form>

    <table class="table">
        <thead>
            <tr>
                <th data-name="serialId">{m["baroo.backstage.mapper.nfc_tag_col"]()}</th>
                <th data-name="userId">{m["baroo.backstage.mapper.user_id_col"]()}</th>
                <th data-name="memberName">{m["baroo.backstage.mapper.user_name_col"]()}</th>
            </tr>
        </thead>
        <tbody id="mappings"></tbody>
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
