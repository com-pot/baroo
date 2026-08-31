import type { BarMember } from "./BarModel";

/** Why one pasted row could not be used. Rendered by the page, so it stays translatable. */
export type MemberImportReason =
    | { code: 'format' }
    | { code: 'invalid_seq'; value: string }
    | { code: 'duplicate_seq'; seq: number }
    | { code: 'duplicate_name'; nickName: string }
    | { code: 'name_taken'; nickName: string; seq: number }
    | { code: 'write_failed'; message: string };

/** A rejected row, with enough context to point the barman at it in their spreadsheet. */
export type MemberImportIssue = {
    /** 1-based index of the line in the pasted text, blank lines counted. */
    lineNo: number;
    /** The line as pasted, so the report can quote it back verbatim. */
    raw: string;
    reason: MemberImportReason;
};

type PlannedRow = { lineNo: number; raw: string; seq: number; nickName: string };

export type MemberImportPlan = {
    /** Numbers nobody in the bar holds yet. */
    creates: PlannedRow[];
    /** Numbers already taken, by someone currently under a different name. */
    renames: (PlannedRow & { id: BarMember["id"] })[];
    /** Rows that already say what the database says. */
    unchanged: number;
    issues: MemberImportIssue[];
};

/** Rows the plan would touch — zero means there was nothing to import at all. */
export function plannedRowCount(plan: MemberImportPlan): number {
    return plan.creates.length + plan.renames.length + plan.unchanged + plan.issues.length;
}

/**
 * Turns a block pasted out of a spreadsheet into an upsert plan keyed by member number.
 *
 * Pure on purpose: every rule that can reject a row is decided here, before a single
 * write goes out, so a paste with a typo in it changes nothing at all.
 */
export function planMemberImport(
    text: string,
    existing: Pick<BarMember, 'id' | 'seq' | 'nickName'>[],
): MemberImportPlan {
    const plan: MemberImportPlan = { creates: [], renames: [], unchanged: 0, issues: [] };

    const bySeq = new Map(existing.map(member => [member.seq, member]));
    // Case-sensitive, like the unique index this guards against.
    const byNickName = new Map(existing.map(member => [member.nickName, member]));

    const seenSeq = new Set<number>();
    const seenNickName = new Set<string>();

    text.split(/\r\n|\r|\n/).forEach((raw, index) => {
        const lineNo = index + 1;
        if (!raw.trim()) return;

        const reject = (reason: MemberImportReason) => plan.issues.push({ lineNo, raw, reason });

        const fields = parseMemberImportLine(raw);
        if (!fields) return reject({ code: 'format' });

        const seq = Number(fields.seq);
        if (!Number.isInteger(seq) || seq < 1) return reject({ code: 'invalid_seq', value: fields.seq });

        const { nickName } = fields;

        if (seenSeq.has(seq)) return reject({ code: 'duplicate_seq', seq });
        if (seenNickName.has(nickName)) return reject({ code: 'duplicate_name', nickName });

        // Both `(bar, seq)` and `(bar, nickName)` are unique, so a name that belongs to
        // somebody else is a conflict even when this row's own number is free. That also
        // rejects a straight swap of two names, which no single-row upsert could apply.
        const nameOwner = byNickName.get(nickName);
        if (nameOwner && nameOwner.seq !== seq) {
            return reject({ code: 'name_taken', nickName, seq: nameOwner.seq });
        }

        seenSeq.add(seq);
        seenNickName.add(nickName);

        const member = bySeq.get(seq);
        if (!member) {
            plan.creates.push({ lineNo, raw, seq, nickName });
        } else if (member.nickName !== nickName) {
            plan.renames.push({ id: member.id, lineNo, raw, seq, nickName });
        } else {
            plan.unchanged++;
        }
    });

    return plan;
}

/** Parses one tab-separated `seq\tnickName` row. */
export function parseMemberImportLine(raw: string): { seq: string; nickName: string } | null {
    const [seq, nickName, ...rest] = raw.split('\t').map(field => field.trim());

    // A spreadsheet selection often carries empty trailing columns; anything with actual
    // content in it means this isn't the two-column paste we were promised.
    if (rest.some(field => field)) return null;
    if (!seq || !nickName) return null;

    return { seq, nickName };
}
