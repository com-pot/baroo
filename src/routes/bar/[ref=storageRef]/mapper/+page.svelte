<script lang="ts">
    import "$assets/boot.scss";
    import { TagMapper } from "$lib/bar/tags";
    import { onMount } from "svelte";

    import type { PageData } from "./$types";

    const { data }: { data: PageData } = $props();

    const mapper = new TagMapper(data.ref);

    function persistUser(e: SubmitEvent) {
        const form = e.target as HTMLFormElement;
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        if (!mapper.isValid(data)) {
            alert("Invalid data, please check the form.");
            return false;
        }
        mapper.put(data);

        renderMappings();
        form.reset();
        document.getElementById("status-message")!.innerText =
            `Mapped tag ${data.tag} to user ${data.userId} (${data.nickName})`;

        return false;
    }

    function renderMappings() {
        const tbody = document.getElementById("mappings")!;
        tbody.innerHTML = "";

        for (const mapping of mapper.mappings) {
            const tr = document.createElement("tr");

            const tdTag = document.createElement("td");
            tdTag.innerText = mapping.tag;
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
        const tagInput = document.getElementById("tag") as HTMLInputElement;
        const userId = document.getElementById("userId") as HTMLInputElement;
        const nickName = document.getElementById("nickName") as HTMLInputElement;

        if (!("NDEFReader" in window)) {
            tagInput.readOnly = false;
            document.getElementById("status-message")!.innerText =
                "Web NFC is not supported. Please use a compatible browser (like Chrome on Android).";
            return;
        }

        const ndef = new NDEFReader();
        ndef.scan()
            .then(() => {
                ndef.onreadingerror = () => {
                    
                    console.log(
                        "Cannot read data from the NFC tag. Try another one?",
                    );
                };
                ndef.onreading = async (event: any) => {
                    tagInput.value = event.serialNumber;
                    const member = await mapper.get(event.serialNumber);
                    if (member) {
                        userId.value = member.userId;
                        nickName.value = member.nickName;
                    }

                    userId.focus();
                };
            })
            .catch((error) => {
                alert(`Error! Scan failed to start: ${error}.`);
            });
    }

    onMount(() => {
        renderMappings();
    });
</script>

<svelte:head>
    <title>NFC mapper - {data.bar?.name || data.ref.key}</title>
</svelte:head>

<h1>NFC mapper - {data.bar?.name || data.ref.key}</h1>

<div class="boot">
    <button onclick={() => startMapper()}>Start mapper</button>
</div>

<div class="container">
    <form onsubmit={(event) => persistUser(event)} autocomplete="off">
        <fieldset class="grid-layout">
            <div class="input-group">
                <label for="tag">NFC tag:</label>
                <input type="text" id="tag" name="tag" required readonly />
            </div>

            <div class="input-group">
                <label for="userId">User id:</label>
                <input type="text" id="userId" name="userId" required />
            </div>

            <div class="input-group">
                <label for="nickName">Nickname:</label>
                <input type="text" id="nickName" name="nickName" required />
            </div>

            <div class="input-group">
                <input type="submit" value="Map NFC to User" />
            </div>
        </fieldset>
    </form>
    <div id="status">
        <p>Status: <span id="status-message"></span></p>
    </div>

    <table>
        <thead>
            <tr>
                <th data-name="tag">NFC Tag</th>
                <th data-name="userId">User ID</th>
                <th data-name=" ">User Name</th>
            </tr>
        </thead>
        <tbody id="mappings"></tbody>
    </table>
</div>

<style data-name="forms">
    .grid-layout {
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 0.5em 1em;
        align-items: center;
    }
    .grid-layout .input-group {
        display: contents;
    }
    .grid-layout input[type="submit"] {
        grid-column: span 2;
        justify-self: start;
    }
</style>
