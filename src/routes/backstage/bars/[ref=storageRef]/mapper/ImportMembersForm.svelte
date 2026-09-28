<script lang="ts">
import { parseMappingFromCsv, type BulkImportData, type TagMapping } from "$lib/bar/tags";
import * as m from "$lib/paraglide/messages.js";

const {
    doImport,
}: {
    doImport: (data: BulkImportData<TagMapping>) => unknown,
} = $props()

let importData = $state("");
async function handleImport(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const csvData = formData.get('importData') as string;

    if (!csvData?.trim()) {
        alert(m["baroo.backstage.mapper.invalid_import_format"]());
        return;
    }
    doImport(parseMappingFromCsv(csvData, parseImportLine))


}
function parseImportLine(line: string): TagMapping | null {
    const parts = line.split('\t');
    if (parts.length !== 3) {
        return null;
    }

    const [seq, nickName, serialId] = parts.map(p => p.trim());

    if (!seq || !nickName || !serialId) {
        return null;
    }

    return {
        member: {
            seq: Number(seq),
            nickName,
            id: '',
        },
        serialId,
    };
}

</script>

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
